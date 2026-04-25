// Lokal FHIR-cache baserad på SQLite (better-sqlite3).
// Speglar de viktigaste kolumnerna från core-db men kör inline och utan Postgres-beroende.

import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Logger } from 'pino';

export interface PatientRow {
  personnummer: string;
  fornamn: string | null;
  efternamn: string | null;
  fodelsedatum: string | null;
  kon: string | null;
  adress: string | null;
  postnr: string | null;
  postort: string | null;
  telefon: string | null;
  source_systems: string | null; // JSON-serialized array
  updated_at: string;
}

export interface ObservationRow {
  event_id: string;
  patient_pnr: string;
  category: string | null;
  code_system: string | null;
  code: string | null;
  display: string | null;
  value_numeric: number | null;
  value_text: string | null;
  unit: string | null;
  effective_at: string | null;
  source_system: string | null;
  event_data: string;
}

export interface MedicationRow {
  event_id: string;
  patient_pnr: string;
  atc_code: string | null;
  drug_name: string | null;
  strength: string | null;
  dosage: string | null;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
  source_system: string | null;
  event_data: string;
}

export interface ConditionRow {
  event_id: string;
  patient_pnr: string;
  icd_code: string | null;
  display: string | null;
  diagnosis_type: string | null;
  onset_at: string | null;
  source_system: string | null;
  event_data: string;
}

export interface ProcedureRow {
  event_id: string;
  patient_pnr: string;
  code: string | null;
  display: string | null;
  kva_code: string | null;
  laterality: string | null;
  implant_manufacturer: string | null;
  implant_model: string | null;
  implant_size: string | null;
  procedure_date: string | null;
  source_system: string | null;
  event_data: string;
}

export interface AllergyRow {
  event_id: string;
  patient_pnr: string;
  substance: string | null;
  severity: string | null;
  reaction: string | null;
  source_system: string | null;
  event_data: string;
}

export interface EncounterRow {
  encounter_ref: string;
  patient_pnr: string;
  encounter_type: string | null;
  department_name: string | null;
  admission_date: string | null;
  discharge_date: string | null;
  status: string | null;
  source_system: string | null;
  event_data: string;
}

export interface EverythingBundle {
  patient: PatientRow | null;
  observations: ObservationRow[];
  medications: MedicationRow[];
  conditions: ConditionRow[];
  procedures: ProcedureRow[];
  allergies: AllergyRow[];
  encounters: EncounterRow[];
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS fhir_patients (
  personnummer   TEXT PRIMARY KEY,
  fornamn        TEXT,
  efternamn      TEXT,
  fodelsedatum   TEXT,
  kon            TEXT,
  adress         TEXT,
  postnr         TEXT,
  postort        TEXT,
  telefon        TEXT,
  source_systems TEXT,
  updated_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS fhir_observations (
  event_id      TEXT PRIMARY KEY,
  patient_pnr   TEXT NOT NULL,
  category      TEXT,
  code_system   TEXT,
  code          TEXT,
  display       TEXT,
  value_numeric REAL,
  value_text    TEXT,
  unit          TEXT,
  effective_at  TEXT,
  source_system TEXT,
  event_data    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_obs_patient ON fhir_observations(patient_pnr);
CREATE INDEX IF NOT EXISTS idx_obs_effective ON fhir_observations(effective_at DESC);

CREATE TABLE IF NOT EXISTS fhir_medication_statements (
  event_id      TEXT PRIMARY KEY,
  patient_pnr   TEXT NOT NULL,
  atc_code      TEXT,
  drug_name     TEXT,
  strength      TEXT,
  dosage        TEXT,
  status        TEXT,
  start_date    TEXT,
  end_date      TEXT,
  source_system TEXT,
  event_data    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_med_patient ON fhir_medication_statements(patient_pnr);

CREATE TABLE IF NOT EXISTS fhir_conditions (
  event_id       TEXT PRIMARY KEY,
  patient_pnr    TEXT NOT NULL,
  icd_code       TEXT,
  display        TEXT,
  diagnosis_type TEXT,
  onset_at       TEXT,
  source_system  TEXT,
  event_data     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cond_patient ON fhir_conditions(patient_pnr);

CREATE TABLE IF NOT EXISTS fhir_procedures (
  event_id             TEXT PRIMARY KEY,
  patient_pnr          TEXT NOT NULL,
  code                 TEXT,
  display              TEXT,
  kva_code             TEXT,
  laterality           TEXT,
  implant_manufacturer TEXT,
  implant_model        TEXT,
  implant_size         TEXT,
  procedure_date       TEXT,
  source_system        TEXT,
  event_data           TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_proc_patient ON fhir_procedures(patient_pnr);

CREATE TABLE IF NOT EXISTS fhir_allergy_intolerances (
  event_id      TEXT PRIMARY KEY,
  patient_pnr   TEXT NOT NULL,
  substance     TEXT,
  severity      TEXT,
  reaction      TEXT,
  source_system TEXT,
  event_data    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_allergy_patient ON fhir_allergy_intolerances(patient_pnr);

CREATE TABLE IF NOT EXISTS fhir_encounters (
  encounter_ref   TEXT PRIMARY KEY,
  patient_pnr     TEXT NOT NULL,
  encounter_type  TEXT,
  department_name TEXT,
  admission_date  TEXT,
  discharge_date  TEXT,
  status          TEXT,
  source_system   TEXT,
  event_data      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_enc_patient ON fhir_encounters(patient_pnr);

CREATE TABLE IF NOT EXISTS blocked_patients (
  personnummer    TEXT NOT NULL,
  blocked_for_hsa TEXT NOT NULL,
  blocked_at      TEXT NOT NULL,
  PRIMARY KEY (personnummer, blocked_for_hsa)
);

CREATE TABLE IF NOT EXISTS sync_metadata (
  topic          TEXT PRIMARY KEY,
  last_offset    TEXT,
  last_timestamp TEXT,
  updated_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`;

type ClinicalRecord = {
  event_id?: string;
  patient_id?: string;
  patient_pnr?: string;
  timestamp?: string;
  source_system?: string;
  source_instance?: string;
  payload?: Record<string, unknown>;
  [key: string]: unknown;
};

function extractPnr(data: ClinicalRecord): string | null {
  if (typeof data.patient_pnr === 'string') return data.patient_pnr;
  if (typeof data.patient_id === 'string') return data.patient_id;
  const patient = data.patient as Record<string, unknown> | undefined;
  if (patient && typeof patient.personnummer === 'string') return patient.personnummer;
  return null;
}

/** Många av våra clinical events har ett `payload.*`-wrapper för domän-
 *  specifika fält (från packages/shared/events.ts). Returnerar payload om
 *  den finns, annars eventet self (så testerna också fungerar). */
function body(data: ClinicalRecord): Record<string, unknown> {
  if (data.payload && typeof data.payload === 'object') return data.payload;
  return data as Record<string, unknown>;
}

export class FhirCache {
  readonly db: Database.Database;

  constructor(
    private readonly path: string,
    private readonly logger: Logger,
  ) {
    if (path !== ':memory:') {
      try {
        mkdirSync(dirname(path), { recursive: true });
      } catch {
        /* already exists or permission-handled downstream */
      }
    }
    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.exec(SCHEMA);
    this.logger.info({ path }, 'fhir-cache SQLite initialised');
  }

  close(): void {
    try {
      this.db.close();
    } catch {
      /* noop */
    }
  }

  // --------------------------------------------------
  // Patient
  // --------------------------------------------------

  upsertPatient(p: Partial<PatientRow> & { personnummer: string }): void {
    this.db
      .prepare(
        `INSERT INTO fhir_patients (
           personnummer, fornamn, efternamn, fodelsedatum, kon,
           adress, postnr, postort, telefon, source_systems, updated_at
         ) VALUES (
           @personnummer, @fornamn, @efternamn, @fodelsedatum, @kon,
           @adress, @postnr, @postort, @telefon, @source_systems,
           COALESCE(@updated_at, CURRENT_TIMESTAMP)
         )
         ON CONFLICT(personnummer) DO UPDATE SET
           fornamn        = excluded.fornamn,
           efternamn      = excluded.efternamn,
           fodelsedatum   = excluded.fodelsedatum,
           kon            = excluded.kon,
           adress         = excluded.adress,
           postnr         = excluded.postnr,
           postort        = excluded.postort,
           telefon        = excluded.telefon,
           source_systems = excluded.source_systems,
           updated_at     = excluded.updated_at`,
      )
      .run({
        personnummer: p.personnummer,
        fornamn: p.fornamn ?? null,
        efternamn: p.efternamn ?? null,
        fodelsedatum: p.fodelsedatum ?? null,
        kon: p.kon ?? null,
        adress: p.adress ?? null,
        postnr: p.postnr ?? null,
        postort: p.postort ?? null,
        telefon: p.telefon ?? null,
        source_systems: p.source_systems ?? null,
        updated_at: p.updated_at ?? null,
      });
  }

  findPatientByPnr(pnr: string): PatientRow | null {
    return (
      (this.db
        .prepare('SELECT * FROM fhir_patients WHERE personnummer = ?')
        .get(pnr) as PatientRow | undefined) ?? null
    );
  }

  listPatients(limit = 50): PatientRow[] {
    return this.db
      .prepare('SELECT * FROM fhir_patients ORDER BY updated_at DESC LIMIT ?')
      .all(limit) as PatientRow[];
  }

  patientCount(): number {
    const r = this.db.prepare('SELECT COUNT(*) AS n FROM fhir_patients').get() as { n: number };
    return r.n;
  }

  // --------------------------------------------------
  // Clinical upserts — drivs av sync-manager/hydration
  // --------------------------------------------------

  upsertObservation(data: ClinicalRecord): void {
    const pnr = extractPnr(data);
    if (!pnr) return;
    const eventId = String(data.event_id ?? `obs:${pnr}:${Date.now()}:${Math.random()}`);
    const b = body(data);
    // Observation-kod: kan ligga som {system, code, display} eller som
    // `observation_type` (string) beroende på mapper.
    const code = b.code as Record<string, unknown> | undefined;
    this.db
      .prepare(
        `INSERT OR REPLACE INTO fhir_observations (
           event_id, patient_pnr, category, code_system, code, display,
           value_numeric, value_text, unit, effective_at, source_system, event_data
         ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        eventId,
        pnr,
        strOrNull(b.category),
        strOrNull(code?.system ?? b.code_system),
        strOrNull(code?.code ?? b.code),
        strOrNull(code?.display ?? b.display),
        toNum(b.value_numeric ?? b.value ?? ((b.value_quantity as Record<string, unknown> | undefined)?.value)),
        strOrNull(b.value_text),
        strOrNull(b.unit ?? ((b.value_quantity as Record<string, unknown> | undefined)?.unit)),
        strOrNull(b.effective_at ?? data.timestamp),
        strOrNull(data.source_instance ?? data.source_system),
        JSON.stringify(data),
      );
  }

  upsertMedication(data: ClinicalRecord): void {
    const pnr = extractPnr(data);
    if (!pnr) return;
    const eventId = String(data.event_id ?? `med:${pnr}:${Date.now()}:${Math.random()}`);
    const b = body(data);
    // Medication kan ligga som b.medication-objekt eller platt
    const m = (b.medication as Record<string, unknown> | undefined) ?? b;
    this.db
      .prepare(
        `INSERT OR REPLACE INTO fhir_medication_statements (
           event_id, patient_pnr, atc_code, drug_name, strength, dosage,
           status, start_date, end_date, source_system, event_data
         ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        eventId,
        pnr,
        strOrNull(b.atc_code ?? m.code ?? m.atc_code),
        strOrNull(b.drug_name ?? m.display ?? m.name ?? m.drug_name),
        strOrNull(b.strength),
        strOrNull(b.dosage),
        strOrNull(b.status ?? m.status)?.toLowerCase() ?? 'active',
        strOrNull(b.start_date),
        strOrNull(b.end_date),
        strOrNull(data.source_instance ?? data.source_system),
        JSON.stringify(data),
      );
  }

  upsertCondition(data: ClinicalRecord): void {
    const pnr = extractPnr(data);
    if (!pnr) return;
    const eventId = String(data.event_id ?? `cond:${pnr}:${Date.now()}:${Math.random()}`);
    const b = body(data);
    const cond = (b.condition as Record<string, unknown> | undefined) ?? b;
    this.db
      .prepare(
        `INSERT OR REPLACE INTO fhir_conditions (
           event_id, patient_pnr, icd_code, display, diagnosis_type, onset_at,
           source_system, event_data
         ) VALUES (?,?,?,?,?,?,?,?)`,
      )
      .run(
        eventId,
        pnr,
        strOrNull(b.icd_code ?? cond.code ?? cond.icd_code),
        strOrNull(b.display ?? cond.display),
        strOrNull(b.diagnosis_type),
        strOrNull(b.onset_at ?? cond.onset_at ?? data.timestamp),
        strOrNull(data.source_instance ?? data.source_system),
        JSON.stringify(data),
      );
  }

  upsertProcedure(data: ClinicalRecord): void {
    const pnr = extractPnr(data);
    if (!pnr) return;
    const eventId = String(data.event_id ?? `proc:${pnr}:${Date.now()}:${Math.random()}`);
    const b = body(data);
    const proc = (b.procedure as Record<string, unknown> | undefined) ?? b;
    const implant = (b.implant ?? proc.implant) as Record<string, unknown> | undefined;
    this.db
      .prepare(
        `INSERT OR REPLACE INTO fhir_procedures (
           event_id, patient_pnr, code, display, kva_code, laterality,
           implant_manufacturer, implant_model, implant_size,
           procedure_date, source_system, event_data
         ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        eventId,
        pnr,
        strOrNull(b.code ?? proc.code),
        strOrNull(b.display ?? proc.display),
        strOrNull(b.kva_code ?? proc.kva_code),
        strOrNull(b.laterality ?? proc.laterality),
        strOrNull(implant?.manufacturer),
        strOrNull(implant?.model),
        strOrNull(implant?.size),
        strOrNull(b.performed_date ?? b.procedure_date ?? proc.performed_date ?? data.timestamp),
        strOrNull(data.source_instance ?? data.source_system),
        JSON.stringify(data),
      );
  }

  upsertAllergy(data: ClinicalRecord): void {
    const pnr = extractPnr(data);
    if (!pnr) return;
    const eventId = String(data.event_id ?? `allergy:${pnr}:${Date.now()}:${Math.random()}`);
    const b = body(data);
    const a = (b.allergy as Record<string, unknown> | undefined) ?? b;
    this.db
      .prepare(
        `INSERT OR REPLACE INTO fhir_allergy_intolerances (
           event_id, patient_pnr, substance, severity, reaction, source_system, event_data
         ) VALUES (?,?,?,?,?,?,?)`,
      )
      .run(
        eventId,
        pnr,
        strOrNull(b.substance ?? b.drug ?? a.substance ?? a.drug ?? a.display),
        strOrNull(b.severity ?? a.severity ?? a.criticality),
        strOrNull(b.reaction ?? a.reaction),
        strOrNull(data.source_instance ?? data.source_system),
        JSON.stringify(data),
      );
  }

  upsertEncounter(data: ClinicalRecord): void {
    const pnr = extractPnr(data);
    if (!pnr) return;
    const b = body(data);
    const enc = (b.encounter as Record<string, unknown> | undefined) ?? b;
    const ref = String(
      b.encounter_ref ?? b.encounter_id ?? enc.encounter_ref ?? enc.encounter_id
        ?? `enc:${pnr}:${data.timestamp ?? Date.now()}`,
    );
    this.db
      .prepare(
        `INSERT OR REPLACE INTO fhir_encounters (
           encounter_ref, patient_pnr, encounter_type, department_name,
           admission_date, discharge_date, status, source_system, event_data
         ) VALUES (?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        ref,
        pnr,
        strOrNull(b.encounter_type ?? enc.encounter_type ?? b.class),
        strOrNull(b.department_name ?? enc.department_name ?? b.service_provider),
        strOrNull(b.admission_date ?? enc.admission_date ?? b.period_start ?? data.timestamp),
        strOrNull(b.discharge_date ?? enc.discharge_date ?? b.period_end),
        strOrNull(b.status ?? enc.status),
        strOrNull(data.source_instance ?? data.source_system),
        JSON.stringify(data),
      );
  }

  // --------------------------------------------------
  // Query helpers
  // --------------------------------------------------

  queryPatientEverything(pnr: string): EverythingBundle {
    const patient = this.findPatientByPnr(pnr);
    return {
      patient,
      observations: this.db
        .prepare(
          'SELECT * FROM fhir_observations WHERE patient_pnr = ? ORDER BY effective_at DESC LIMIT 200',
        )
        .all(pnr) as ObservationRow[],
      medications: this.db
        .prepare('SELECT * FROM fhir_medication_statements WHERE patient_pnr = ? LIMIT 200')
        .all(pnr) as MedicationRow[],
      conditions: this.db
        .prepare('SELECT * FROM fhir_conditions WHERE patient_pnr = ? LIMIT 200')
        .all(pnr) as ConditionRow[],
      procedures: this.db
        .prepare('SELECT * FROM fhir_procedures WHERE patient_pnr = ? LIMIT 200')
        .all(pnr) as ProcedureRow[],
      allergies: this.db
        .prepare('SELECT * FROM fhir_allergy_intolerances WHERE patient_pnr = ? LIMIT 200')
        .all(pnr) as AllergyRow[],
      encounters: this.db
        .prepare(
          'SELECT * FROM fhir_encounters WHERE patient_pnr = ? ORDER BY admission_date DESC LIMIT 200',
        )
        .all(pnr) as EncounterRow[],
    };
  }

  // --------------------------------------------------
  // Spärregister (PDL) + sync-metadata
  // --------------------------------------------------

  upsertBlockedPatient(pnr: string, blockedForHsa: string): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO blocked_patients (personnummer, blocked_for_hsa, blocked_at)
         VALUES (?, ?, CURRENT_TIMESTAMP)`,
      )
      .run(pnr, blockedForHsa);
  }

  isBlocked(pnr: string, hsaId: string): boolean {
    const r = this.db
      .prepare(
        'SELECT 1 FROM blocked_patients WHERE personnummer = ? AND blocked_for_hsa = ? LIMIT 1',
      )
      .get(pnr, hsaId);
    return r !== undefined;
  }

  setSyncOffset(topic: string, offset: string, timestamp: string): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO sync_metadata (topic, last_offset, last_timestamp, updated_at)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
      )
      .run(topic, offset, timestamp);
  }

  getLastSyncTimestamp(topic: string): string | null {
    const r = this.db
      .prepare('SELECT last_timestamp FROM sync_metadata WHERE topic = ?')
      .get(topic) as { last_timestamp: string | null } | undefined;
    return r?.last_timestamp ?? null;
  }

  sizeBytes(): number {
    const r = this.db
      .prepare('SELECT page_count * page_size AS size FROM pragma_page_count(), pragma_page_size()')
      .get() as { size: number } | undefined;
    return r?.size ?? 0;
  }
}

function strOrNull(x: unknown): string | null {
  if (x == null) return null;
  if (typeof x === 'string') return x.length > 0 ? x : null;
  if (typeof x === 'number' || typeof x === 'boolean') return String(x);
  return null;
}

function toNum(x: unknown): number | null {
  if (typeof x === 'number' && Number.isFinite(x)) return x;
  if (typeof x === 'string' && x.length > 0) {
    const n = Number(x);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
