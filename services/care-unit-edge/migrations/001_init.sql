-- Care-unit-edge SQLite-schema (Sprint 1, P2).
-- Speglar fhir_*-tabellerna i central core-db men förenklat — vi behöver
-- bara nog för att svara på FHIR-anrop offline. Plus outbox för utgående
-- skrivningar och sync_state för cursor-tracking.

-- ============================================================
-- FHIR-projektioner (subset av core-db.fhir_*)
-- Allt JSON-event-data ligger som BLOB; indexerade kolumner för sökning.
-- ============================================================

CREATE TABLE IF NOT EXISTS fhir_patients (
  personnummer    TEXT PRIMARY KEY,
  fornamn         TEXT,
  efternamn       TEXT,
  fodelsedatum    TEXT,
  kon             TEXT,
  source_systems  TEXT,
  event_data      TEXT NOT NULL,
  updated_at      TEXT DEFAULT CURRENT_TIMESTAMP,
  version         INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS fhir_encounters (
  encounter_ref   TEXT PRIMARY KEY,
  patient_pnr     TEXT NOT NULL,
  encounter_type  TEXT,
  department_code TEXT,
  department_name TEXT,
  admission_date  TEXT,
  discharge_date  TEXT,
  status          TEXT,
  source_system   TEXT,
  event_data      TEXT NOT NULL,
  updated_at      TEXT DEFAULT CURRENT_TIMESTAMP,
  version         INTEGER DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_enc_patient ON fhir_encounters(patient_pnr);

CREATE TABLE IF NOT EXISTS fhir_observations (
  observation_id  TEXT PRIMARY KEY,
  patient_pnr     TEXT NOT NULL,
  category        TEXT,
  code_system     TEXT,
  code            TEXT,
  display         TEXT,
  value_numeric   REAL,
  value_text      TEXT,
  unit            TEXT,
  effective_at    TEXT,
  source_system   TEXT,
  event_data      TEXT NOT NULL,
  created_at      TEXT DEFAULT CURRENT_TIMESTAMP,
  version         INTEGER DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_obs_patient ON fhir_observations(patient_pnr);

CREATE TABLE IF NOT EXISTS fhir_medications (
  medication_id   TEXT PRIMARY KEY,
  patient_pnr     TEXT NOT NULL,
  atc_code        TEXT,
  drug_name       TEXT,
  status          TEXT,
  start_date      TEXT,
  end_date        TEXT,
  source_system   TEXT,
  event_data      TEXT NOT NULL,
  created_at      TEXT DEFAULT CURRENT_TIMESTAMP,
  version         INTEGER DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_med_patient ON fhir_medications(patient_pnr);

CREATE TABLE IF NOT EXISTS fhir_conditions (
  condition_id    TEXT PRIMARY KEY,
  patient_pnr     TEXT NOT NULL,
  icd_code        TEXT,
  display         TEXT,
  diagnosis_type  TEXT,
  source_system   TEXT,
  event_data      TEXT NOT NULL,
  created_at      TEXT DEFAULT CURRENT_TIMESTAMP,
  version         INTEGER DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_cond_patient ON fhir_conditions(patient_pnr);

CREATE TABLE IF NOT EXISTS fhir_allergies (
  allergy_id      TEXT PRIMARY KEY,
  patient_pnr     TEXT NOT NULL,
  allergen        TEXT,
  severity        TEXT,
  source_system   TEXT,
  event_data      TEXT NOT NULL,
  created_at      TEXT DEFAULT CURRENT_TIMESTAMP,
  version         INTEGER DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_allergy_patient ON fhir_allergies(patient_pnr);

CREATE TABLE IF NOT EXISTS fhir_procedures (
  procedure_id    TEXT PRIMARY KEY,
  patient_pnr     TEXT NOT NULL,
  code            TEXT,
  display         TEXT,
  procedure_date  TEXT,
  source_system   TEXT,
  event_data      TEXT NOT NULL,
  created_at      TEXT DEFAULT CURRENT_TIMESTAMP,
  version         INTEGER DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_proc_patient ON fhir_procedures(patient_pnr);

-- ============================================================
-- Outbox: lokala skrivningar att synca uppströms
-- Strikt async — lokala writes blockar aldrig på sync-worker.
-- Idempotency = SHA256(payload).
-- ============================================================
CREATE TABLE IF NOT EXISTS outbox (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type       TEXT NOT NULL,
  resource_type    TEXT NOT NULL,
  resource_id      TEXT NOT NULL,
  payload          TEXT NOT NULL,
  payload_hash     TEXT NOT NULL,
  created_at       TEXT DEFAULT CURRENT_TIMESTAMP,
  sync_attempts    INTEGER DEFAULT 0,
  last_attempt_at  TEXT,
  synced_at        TEXT,
  last_error       TEXT
);
CREATE INDEX IF NOT EXISTS idx_outbox_pending ON outbox(synced_at) WHERE synced_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_outbox_idempotency ON outbox(payload_hash);

-- ============================================================
-- Sync-state: cursors och tidsstämplar
-- ============================================================
CREATE TABLE IF NOT EXISTS sync_state (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- Konflikter (loggas vid pull-konflikt; löses manuellt via dashboard)
-- ============================================================
CREATE TABLE IF NOT EXISTS conflicts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  resource_type   TEXT NOT NULL,
  resource_id     TEXT NOT NULL,
  local_version   INTEGER NOT NULL,
  remote_version  INTEGER NOT NULL,
  local_data      TEXT NOT NULL,
  remote_data     TEXT NOT NULL,
  detected_at     TEXT DEFAULT CURRENT_TIMESTAMP,
  resolution      TEXT,
  resolved_at     TEXT
);
