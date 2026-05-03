// Materializer — konsumerar domain events + raw CDC patients och upsert:ar
// till fhir_*-tabeller i core-db. Körs bara i FHIR_MODE=primary.

import type { Logger } from 'pino';
import { Kafka, type Consumer } from 'kafkajs';
import type pg from 'pg';
import type { FhirFacadeConfig } from './config.js';

/** Kafka-events med `core.clinical.*`-topics produceras av två källor:
 *  - `transform/` (production-flöde) — skickar `patient_id` (PNR-string) +
 *    `timestamp`. Detta var ursprungligt design.
 *  - `kafka-test-producer/` (P3.2-fixture) — skickar `patient_pnr` +
 *    `occurred_at`. Designat för composer-konsumtion (`openehr-composer/`
 *    läser `patient_pnr` direkt) — men materializer som ursprungligen
 *    bara läste `patient_id` failade på NOT NULL-violation (Sprint 2.5 B1).
 *
 *  Dual-key-läsning bevarar bakåtkompatibilitet med båda producenterna:
 *  extractPnr/extractTimestamp läser primär-fält först, fallback om saknas. */
type BaseEventLike = {
  event_id: string;
  event_type: string;
  timestamp?: string;
  occurred_at?: string;
  source_system?: string;
  source_instance?: string;
  patient_id?: string;
  patient_pnr?: string;
  payload?: Record<string, unknown>;
};

function extractPnr(event: BaseEventLike): string | null {
  return event.patient_id ?? event.patient_pnr ?? null;
}

function extractTimestamp(event: BaseEventLike): string | null {
  return event.timestamp ?? event.occurred_at ?? null;
}

/** Debezium-unwrap-flat payload — fält direkt på roten + __op/__deleted metadata. */
type DebeziumFlatRow = Record<string, unknown> & {
  __op?: string;
  __deleted?: string;
  __source_table?: string;
};

export class Materializer {
  private readonly kafka: Kafka;
  private readonly consumer: Consumer;
  public processed = 0;
  public errors = 0;
  public byType: Record<string, number> = {};

  constructor(
    private readonly config: FhirFacadeConfig,
    private readonly pool: pg.Pool,
    private readonly logger: Logger,
  ) {
    this.kafka = new Kafka({
      clientId: `${config.kafka.clientId}-materializer`,
      brokers: config.kafka.brokers,
      retry: { retries: 10, initialRetryTime: 300 },
    });
    this.consumer = this.kafka.consumer({
      groupId: config.kafka.groupId,
      sessionTimeout: 30000,
      heartbeatInterval: 3000,
    });
  }

  async start(): Promise<void> {
    await this.consumer.connect();
    const patientsTopicRegex = /^vgr\.cdc\.(melior|asynja)(?:\.\w+)?\.public\.patients$/;
    const topics = [...this.config.clinicalTopics, patientsTopicRegex];
    this.logger.info({ topics: this.config.clinicalTopics, pattern: patientsTopicRegex.source }, 'Materializer subscribing');
    await this.consumer.subscribe({ topics, fromBeginning: true });

    await this.consumer.run({
      eachMessage: async ({ topic, message }) => {
        if (!message.value) return;
        try {
          if (patientsTopicRegex.test(topic)) {
            const raw = JSON.parse(message.value.toString()) as DebeziumFlatRow;
            const sourceSystem = topic.includes('.melior.') ? 'melior' : 'asynja';
            await this.upsertPatientFromCdc(raw, sourceSystem);
          } else {
            const event = JSON.parse(message.value.toString()) as BaseEventLike;
            await this.dispatchClinical(topic, event);
          }
          this.processed++;
          this.byType[topic] = (this.byType[topic] ?? 0) + 1;
        } catch (err) {
          this.errors++;
          this.logger.error({ err, topic }, 'Materialize error');
        }
      },
    });
    this.logger.info('Materializer running');
  }

  async stop(): Promise<void> {
    await this.consumer.disconnect();
  }

  // ============================================================
  // Patients från CDC (Debezium-unwrap-flat, inte ingest-wrappad)
  // ============================================================
  private async upsertPatientFromCdc(raw: DebeziumFlatRow, sourceSystem: 'melior' | 'asynja'): Promise<void> {
    if (raw.__deleted === 'true') return; // skippa tombstone-rader
    const pnr = raw.personnummer as string | undefined;
    if (!pnr) return;
    const source = sourceSystem === 'melior' ? `melior-${this.config.instanceId}` : 'asynja';
    await this.pool.query(
      `INSERT INTO fhir_patients (personnummer, fornamn, efternamn, fodelsedatum, kon,
        adress, postnr, postort, telefon, source_systems, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, ARRAY[$10]::text[], NOW())
       ON CONFLICT (personnummer) DO UPDATE SET
         fornamn = EXCLUDED.fornamn,
         efternamn = EXCLUDED.efternamn,
         fodelsedatum = EXCLUDED.fodelsedatum,
         kon = EXCLUDED.kon,
         adress = COALESCE(EXCLUDED.adress, fhir_patients.adress),
         postnr = COALESCE(EXCLUDED.postnr, fhir_patients.postnr),
         postort = COALESCE(EXCLUDED.postort, fhir_patients.postort),
         telefon = COALESCE(EXCLUDED.telefon, fhir_patients.telefon),
         source_systems = (SELECT array_agg(DISTINCT x) FROM unnest(fhir_patients.source_systems || EXCLUDED.source_systems) x),
         updated_at = NOW()`,
      [
        pnr,
        raw.fornamn ?? null,
        raw.efternamn ?? null,
        this.dateOrNull(raw.fodelsedatum),
        raw.kon ?? null,
        raw.adress ?? null,
        raw.postnr ?? null,
        raw.postort ?? null,
        raw.telefon ?? null,
        source,
      ],
    );
  }

  // ============================================================
  // Clinical dispatch
  // ============================================================
  private async dispatchClinical(topic: string, event: BaseEventLike): Promise<void> {
    // Sprint 2.5 B1: skipp event utan PNR med warning istället för att låta
    // det bryta NOT NULL-constraint i FHIR-tabellen. Producent-fixet är
    // `patient_pnr` ELLER `patient_id` (extractPnr accepterar båda).
    if (!extractPnr(event)) {
      this.logger.warn(
        { event_id: event.event_id, topic, event_type: event.event_type },
        'Materialize skipped: event saknar patient_id/patient_pnr',
      );
      return;
    }
    switch (topic) {
      case 'core.clinical.encounter.started':
      case 'core.clinical.encounter.ended':
        return this.upsertEncounter(event);
      case 'core.clinical.observation.vitals':
        return this.upsertObservationVitals(event);
      case 'core.clinical.lab.result':
        return this.upsertObservationLab(event);
      case 'core.clinical.medication.prescribed':
        return this.upsertMedication(event);
      case 'core.clinical.procedure.completed':
        return this.upsertProcedure(event);
      case 'core.clinical.condition.diagnosed':
        return this.upsertCondition(event);
      case 'core.clinical.allergy.reported':
        return this.upsertAllergy(event);
      default:
        this.logger.debug({ topic }, 'No materializer for topic');
    }
  }

  private async upsertEncounter(event: BaseEventLike): Promise<void> {
    const p = event.payload ?? {};
    // Prefixera med source_instance för att undvika kollision mellan källsystem
    // som båda har encounter_id=1.
    const localId = p.encounter_id ?? event.event_id;
    const encRef = `${event.source_instance ?? event.source_system ?? 'unknown'}:${localId}`;
    await this.pool.query(
      `INSERT INTO fhir_encounters (encounter_ref, patient_pnr, encounter_type,
        department_code, department_name, admission_date, discharge_date,
        status, source_system, event_data, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
       ON CONFLICT (encounter_ref) DO UPDATE SET
         discharge_date = COALESCE(EXCLUDED.discharge_date, fhir_encounters.discharge_date),
         status = EXCLUDED.status,
         event_data = EXCLUDED.event_data,
         updated_at = NOW()`,
      [
        encRef,
        extractPnr(event),
        p.encounter_type ?? null,
        p.department_code ?? null,
        p.department_name ?? null,
        this.tsOrNull(p.admission_date),
        this.tsOrNull(p.discharge_date),
        p.status ?? null,
        event.source_system ?? null,
        event,
      ],
    );
  }

  private async upsertObservationVitals(event: BaseEventLike): Promise<void> {
    const p = event.payload ?? {};
    const values = (p.values as Array<{ code: string; display: string; value: number; unit: string; system?: string }>) ?? [];
    // För BT finns 2 komponenter — skriv BÅDA som en enda rad (använd första + payload har båda)
    const primary = values[0] ?? { code: '', display: '', value: null as unknown as number, unit: '', system: '' };
    await this.pool.query(
      `INSERT INTO fhir_observations (event_id, patient_pnr, category, code_system,
        code, display, value_numeric, value_text, unit, effective_at, encounter_ref,
        source_system, event_data)
       VALUES ($1,$2,'vital-signs',$3,$4,$5,$6,NULL,$7,$8,$9,$10,$11)
       ON CONFLICT (event_id) DO UPDATE SET event_data = EXCLUDED.event_data`,
      [
        event.event_id,
        extractPnr(event),
        primary.system ?? 'http://snomed.info/sct',
        primary.code ?? '',
        primary.display ?? String(p.observation_type ?? ''),
        primary.value ?? null,
        primary.unit ?? '',
        this.tsOrNull(p.recorded_at),
        this.encRef(event, p),
        event.source_system ?? null,
        event,
      ],
    );
  }

  private async upsertObservationLab(event: BaseEventLike): Promise<void> {
    const p = event.payload ?? {};
    const analysis = (p.analysis as { system: string; code: string; display: string }) ?? { system: '', code: '', display: '' };
    const result = (p.result as { value_numeric?: number; value_text?: string; unit?: string }) ?? {};
    await this.pool.query(
      `INSERT INTO fhir_observations (event_id, patient_pnr, category, code_system,
        code, display, value_numeric, value_text, unit, effective_at, encounter_ref,
        source_system, event_data)
       VALUES ($1,$2,'laboratory',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (event_id) DO UPDATE SET event_data = EXCLUDED.event_data`,
      [
        event.event_id,
        extractPnr(event),
        analysis.system,
        analysis.code,
        analysis.display,
        result.value_numeric ?? null,
        result.value_text ?? null,
        result.unit ?? '',
        this.tsOrNull(p.result_available_at ?? p.sample_collected_at ?? extractTimestamp(event)),
        this.encRef(event, p),
        event.source_system ?? null,
        event,
      ],
    );
  }

  private async upsertMedication(event: BaseEventLike): Promise<void> {
    const p = event.payload ?? {};
    await this.pool.query(
      `INSERT INTO fhir_medication_statements (event_id, patient_pnr, atc_code,
        drug_name, strength, dosage, route, frequency, start_date, end_date, status,
        encounter_ref, source_system, event_data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (event_id) DO UPDATE SET
         status = EXCLUDED.status,
         end_date = EXCLUDED.end_date,
         event_data = EXCLUDED.event_data`,
      [
        event.event_id,
        extractPnr(event),
        p.atc_code ?? null,
        p.drug_name ?? null,
        p.strength ?? null,
        p.dosage ?? null,
        p.route ?? null,
        p.frequency ?? null,
        this.dateOrNull(p.start_date),
        this.dateOrNull(p.end_date),
        p.status ?? 'ACTIVE',
        this.encRef(event, p),
        event.source_system ?? null,
        event,
      ],
    );
  }

  private async upsertProcedure(event: BaseEventLike): Promise<void> {
    const p = event.payload ?? {};
    const proc = (p.procedure as { system?: string; code?: string; display?: string }) ?? {};
    const implant = (p.implant as { type?: string; manufacturer?: string; model?: string; size?: string }) ?? {};
    const performer = (p.performer as { hsa_id?: string }) ?? {};
    await this.pool.query(
      `INSERT INTO fhir_procedures (event_id, patient_pnr, code_system, code, display,
        kva_code, laterality, implant_type, implant_manufacturer, implant_model, implant_size,
        performer_hsa, procedure_date, encounter_ref, source_system, event_data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       ON CONFLICT (event_id) DO UPDATE SET event_data = EXCLUDED.event_data`,
      [
        event.event_id,
        extractPnr(event),
        proc.system ?? '',
        proc.code ?? '',
        proc.display ?? '',
        p.procedure_code_kva ?? null,
        p.laterality ?? null,
        implant.type ?? null,
        implant.manufacturer ?? null,
        implant.model ?? null,
        implant.size ?? null,
        performer.hsa_id ?? null,
        this.tsOrNull(p.procedure_date),
        this.encRef(event, p),
        event.source_system ?? null,
        event,
      ],
    );
  }

  private async upsertCondition(event: BaseEventLike): Promise<void> {
    const p = event.payload ?? {};
    await this.pool.query(
      `INSERT INTO fhir_conditions (event_id, patient_pnr, icd_code, display,
        diagnosis_type, onset_at, resolved_at, encounter_ref, source_system, event_data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (event_id) DO UPDATE SET event_data = EXCLUDED.event_data`,
      [
        event.event_id,
        extractPnr(event),
        p.icd_code ?? null,
        p.diagnosis_text ?? null,
        p.diagnosis_type ?? null,
        this.tsOrNull(p.diagnosed_at),
        this.tsOrNull(p.resolved_at),
        this.encRef(event, p),
        event.source_system ?? null,
        event,
      ],
    );
  }

  private async upsertAllergy(event: BaseEventLike): Promise<void> {
    const p = event.payload ?? {};
    const coded = (p.allergen_coded as { system?: string; code?: string }) ?? {};
    await this.pool.query(
      `INSERT INTO fhir_allergy_intolerances (event_id, patient_pnr, allergen,
        code_system, code, reaction, severity, verified, reported_at,
        source_system, event_data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (event_id) DO UPDATE SET
         reaction = EXCLUDED.reaction,
         severity = EXCLUDED.severity,
         event_data = EXCLUDED.event_data`,
      [
        event.event_id,
        extractPnr(event),
        p.allergen ?? null,
        coded.system ?? null,
        coded.code ?? null,
        p.reaction ?? null,
        p.severity ?? null,
        Boolean(p.verified),
        this.tsOrNull(p.reported_at),
        event.source_system ?? null,
        event,
      ],
    );
  }

  // ============================================================
  // Helpers
  // ============================================================
  private encRef(event: BaseEventLike, p: Record<string, unknown>): string | null {
    if (p.encounter_id == null) return null;
    const prefix = event.source_instance ?? event.source_system ?? 'unknown';
    return `${prefix}:${p.encounter_id}`;
  }

  private tsOrNull(v: unknown): string | null {
    if (v == null) return null;
    if (typeof v === 'string') return v;
    if (typeof v === 'number') return new Date(v).toISOString();
    return null;
  }

  private dateOrNull(v: unknown): string | null {
    if (v == null) return null;
    if (typeof v === 'string') return v.slice(0, 10);
    if (typeof v === 'number') {
      const ms = Math.abs(v) < 100_000 ? v * 86_400_000 : v;
      return new Date(ms).toISOString().slice(0, 10);
    }
    return null;
  }
}
