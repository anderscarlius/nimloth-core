// ParityRunner (Sprint 2 P3.4, steg 4.2).
//
// Mäter postgres-vs-openehr-paritet genom att anropa båda stores via
// FhirStore-interface och persisterar resultat i parity_snapshots.
// Emitterar audit-event med action='PARITY_RUN' (Path Y, manual publish).
//
// Förutsätter CANONICAL_STORE=both — annars är secondary null och
// paritetsmätning är meningslös (asymmetrisk). Constructor failsar tidigt
// om mode != 'both', så misconfig fångas innan första körning.
//
// PDL: ParityRunner är system-internal — endpoints under /facade/parity/*
// monteras direkt på app i steg 4.5 och går aldrig genom PDL-mw.

import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { Logger } from 'pino';
import type { Producer } from 'kafkajs';
import type { StoreRouter } from '../stores/index.js';
import type { FhirStore, StoreContext } from '../stores/types.js';
import { diffResources } from './diff.js';
import { recordSnapshot } from './recorder.js';
import { emitParityAudit } from './audit.js';
import {
  RESOURCE_TYPES,
  type ParityRun,
  type ParitySnapshot,
  type ParityTrigger,
  type ResourceFailure,
  type ResourceType,
} from './types.js';

/** Skydd mot oavsiktlig fan-out i runForAll. För Sprint 2 = 1 patient
 *  (Fru Andersson); 100 är gott om utrymme för fixture-utvidgning. */
const MAX_PATIENTS_PER_RUN = 100;

const SYSTEM_CONTEXT: StoreContext = { userHsa: 'system:parity-runner' };

export interface ParityRunnerDeps {
  storeRouter: StoreRouter;
  pool: pg.Pool;
  auditProducer: Producer;
  logger: Logger;
}

export class ParityRunner {
  private readonly postgres: FhirStore;
  private readonly openehr: FhirStore;

  constructor(private readonly deps: ParityRunnerDeps) {
    if (deps.storeRouter.mode !== 'both' || !deps.storeRouter.secondary) {
      throw new Error(
        `ParityRunner kräver CANONICAL_STORE=both (är: ${deps.storeRouter.mode}). ` +
          `Asymmetrisk paritet är meningslös.`,
      );
    }
    // I 'both'-mode är primary=postgres, secondary=openehr per stores/index.ts.
    this.postgres = deps.storeRouter.primary;
    this.openehr = deps.storeRouter.secondary;
  }

  /** Kör paritetsdiff för en patient. 6 snapshots inom samma run_id. */
  async runForPatient(pnr: string, trigger: ParityTrigger): Promise<ParityRun> {
    return this.executeRun([pnr], pnr, trigger);
  }

  /** Kör paritetsdiff för alla patienter i openehr_ehr_cache (begränsad
   *  till MAX_PATIENTS_PER_RUN). Direkt SQL är acceptabelt — det är
   *  facade-intern data, inte FHIR-resource-data (jfr AC12). */
  async runForAll(trigger: ParityTrigger): Promise<ParityRun> {
    const r = await this.deps.pool.query<{ patient_pnr: string }>(
      'SELECT patient_pnr FROM openehr_ehr_cache LIMIT $1',
      [MAX_PATIENTS_PER_RUN],
    );
    const pnrs = r.rows.map((row) => row.patient_pnr);
    if (pnrs.length === 0) {
      this.deps.logger.warn('ParityRunner.runForAll: openehr_ehr_cache är tom');
    }
    return this.executeRun(pnrs, null, trigger);
  }

  private async executeRun(
    patientPnrs: string[],
    aggregatePnr: string | null,
    trigger: ParityTrigger,
  ): Promise<ParityRun> {
    const run_id = randomUUID();
    const taken_at = new Date();
    const snapshots: ParitySnapshot[] = [];
    const failures: ResourceFailure[] = [];

    for (const pnr of patientPnrs) {
      for (const resourceType of RESOURCE_TYPES) {
        try {
          const postgresList = await this.searchByType(this.postgres, resourceType, pnr);
          const openehrList = await this.searchByType(this.openehr, resourceType, pnr);
          const diff = diffResources(resourceType, postgresList, openehrList);
          snapshots.push({ resource_type: resourceType, patient_pnr: pnr, ...diff });
        } catch (err) {
          this.deps.logger.error(
            { err: String(err), resource_type: resourceType, patient_pnr: pnr },
            'ParityRunner: resource-diff failed',
          );
          failures.push({ resource_type: resourceType, patient_pnr: pnr, error: String(err) });
        }
      }
    }

    const run: ParityRun = { run_id, taken_at, trigger, patient_pnr: aggregatePnr, snapshots, failures };

    // Persist innan audit. Audit är icke-blockerande — vi får inte tysta
    // data-loss om Kafka är nere; loggar warning och fortsätter.
    await recordSnapshot(this.deps.pool, run);
    emitParityAudit(this.deps.auditProducer, run).catch((err) => {
      this.deps.logger.warn({ err: String(err), run_id }, 'ParityRunner: audit emit failed');
    });

    return run;
  }

  private async searchByType(store: FhirStore, resourceType: ResourceType, pnr: string): Promise<unknown[]> {
    switch (resourceType) {
      case 'Patient': {
        const patient = await store.getPatient(pnr, SYSTEM_CONTEXT);
        return patient ? [patient] : [];
      }
      case 'Observation':
        return store.searchObservations({ patient: pnr }, SYSTEM_CONTEXT);
      case 'MedicationStatement':
        return store.searchMedicationStatements({ patient: pnr }, SYSTEM_CONTEXT);
      case 'Procedure':
        return store.searchProcedures({ patient: pnr }, SYSTEM_CONTEXT);
      case 'Condition':
        return store.searchConditions({ patient: pnr }, SYSTEM_CONTEXT);
      case 'AllergyIntolerance':
        return store.searchAllergyIntolerances({ patient: pnr }, SYSTEM_CONTEXT);
    }
  }
}
