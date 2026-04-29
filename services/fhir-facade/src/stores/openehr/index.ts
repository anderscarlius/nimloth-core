// OpenehrStore — FhirStore-implementation som läser från EHRbase via AQL.
//
// patient_pnr → ehr_id slås upp i samma openehr_ehr_cache-tabell som composer
// skriver till (P3.1). Det betyder att Store-läsning förutsätter att composer
// någon gång har sett patienten — vilket är samma kontrakt som postgres-store
// (där ingen rad finns förrän en CDC-event materialiserats).

import type pg from 'pg';
import type { Logger } from 'pino';
import type {
  FhirPatient,
  FhirObservation,
  FhirMedicationStatement,
  FhirProcedure,
  FhirCondition,
} from '@nimloth-core/shared/types';
import type {
  CanonicalStore,
  FhirStore,
  StoreContext,
  SearchObservationParams,
  SearchByPatientParams,
} from '../types.js';
import { EhrbaseAqlClient, EhrbaseAqlError } from './ehrbase-aql-client.js';
import { AqlBuilder } from './aql-builder.js';
import { AqlToFhir } from './aql-to-fhir.js';
import { CoverageTracker } from './coverage-tracker.js';

export interface OpenehrStoreDeps {
  pool: pg.Pool;
  ehrbaseUrl: string;
  coverage: CoverageTracker;
  logger: Logger;
}

export class OpenehrStore implements FhirStore {
  readonly canonicalStore: CanonicalStore = 'openehr';

  private readonly aql: EhrbaseAqlClient;
  private readonly builder: AqlBuilder;
  private readonly mapper: AqlToFhir;

  constructor(private readonly deps: OpenehrStoreDeps) {
    this.aql = new EhrbaseAqlClient(deps.ehrbaseUrl);
    this.builder = new AqlBuilder();
    this.mapper = new AqlToFhir(deps.coverage);
  }

  async getPatient(id: string, _ctx: StoreContext): Promise<FhirPatient | null> {
    const ehrId = await this.lookupEhrId(id);
    if (!ehrId) return null;
    try {
      const result = await this.aql.execute(this.builder.patient(), { ehr_id: ehrId });
      return this.mapper.toPatient(result, id);
    } catch (err) {
      this.logAqlError('Patient', id, err);
      throw err;
    }
  }

  async searchPatients(
    params: { identifier?: string; family?: string; given?: string; limit?: number },
    ctx: StoreContext,
  ): Promise<FhirPatient[]> {
    // openEHR-vägen stödjer bara identifier (PNR) i Sprint 2 — namnsökning
    // kräver demographics-arketyper som inte är på plats.
    if (params.identifier) {
      const p = await this.getPatient(params.identifier, ctx);
      return p ? [p] : [];
    }
    this.deps.coverage.logMissingField('Patient', 'search.byName', 'openehr-väg-stödjer-bara-identifier');
    return [];
  }

  async searchObservations(params: SearchObservationParams, _ctx: StoreContext): Promise<FhirObservation[]> {
    const ehrId = await this.lookupEhrId(params.patient);
    if (!ehrId) return [];
    try {
      const result = await this.aql.execute(this.builder.observation(), { ehr_id: ehrId });
      let observations = this.mapper.toObservations(result, params.patient);
      // Klient-sida-filtrering eftersom AQL har begränsad WHERE-syntax.
      if (params.from) observations = observations.filter((o) => (o.effectiveDateTime ?? '') >= params.from!);
      if (params.to) observations = observations.filter((o) => (o.effectiveDateTime ?? '') <= params.to!);
      if (params.limit) observations = observations.slice(0, params.limit);
      return observations;
    } catch (err) {
      this.logAqlError('Observation', params.patient, err);
      throw err;
    }
  }

  async searchMedicationStatements(
    params: SearchByPatientParams,
    _ctx: StoreContext,
  ): Promise<FhirMedicationStatement[]> {
    const ehrId = await this.lookupEhrId(params.patient);
    if (!ehrId) return [];
    try {
      const result = await this.aql.execute(this.builder.medicationStatement(), { ehr_id: ehrId });
      const items = this.mapper.toMedicationStatements(result, params.patient);
      return params.limit ? items.slice(0, params.limit) : items;
    } catch (err) {
      this.logAqlError('MedicationStatement', params.patient, err);
      throw err;
    }
  }

  async searchProcedures(params: SearchByPatientParams, _ctx: StoreContext): Promise<FhirProcedure[]> {
    const ehrId = await this.lookupEhrId(params.patient);
    if (!ehrId) return [];
    try {
      const result = await this.aql.execute(this.builder.procedure(), { ehr_id: ehrId });
      const items = this.mapper.toProcedures(result, params.patient);
      return params.limit ? items.slice(0, params.limit) : items;
    } catch (err) {
      this.logAqlError('Procedure', params.patient, err);
      throw err;
    }
  }

  async searchConditions(params: SearchByPatientParams, _ctx: StoreContext): Promise<FhirCondition[]> {
    const ehrId = await this.lookupEhrId(params.patient);
    if (!ehrId) return [];
    try {
      const result = await this.aql.execute(this.builder.condition(), { ehr_id: ehrId });
      const items = this.mapper.toConditions(result, params.patient);
      return params.limit ? items.slice(0, params.limit) : items;
    } catch (err) {
      this.logAqlError('Condition', params.patient, err);
      throw err;
    }
  }

  /** Slå upp ehr_id från openehr_ehr_cache (samma tabell som composer skriver till). */
  private async lookupEhrId(patientPnr: string): Promise<string | null> {
    const r = await this.deps.pool.query<{ ehr_id: string }>(
      'SELECT ehr_id FROM openehr_ehr_cache WHERE patient_pnr = $1',
      [patientPnr],
    );
    return r.rows[0]?.ehr_id ?? null;
  }

  private logAqlError(resource: string, patientPnr: string, err: unknown): void {
    if (err instanceof EhrbaseAqlError) {
      this.deps.logger.warn(
        { resource, patientPnr, status: err.httpStatus, msg: err.message },
        'AQL query failed',
      );
    } else {
      this.deps.logger.error({ err: String(err), resource, patientPnr }, 'AQL unexpected error');
    }
  }
}
