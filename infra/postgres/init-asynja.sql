-- AsynjaVisph (simulerad primärvård).
-- Enklare schema än Melior, lowercase-konvention.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- patients
-- ============================================================
CREATE TABLE IF NOT EXISTS patients (
    patient_id       SERIAL PRIMARY KEY,
    personnummer     VARCHAR(13) UNIQUE NOT NULL,
    fornamn          VARCHAR(100),
    efternamn        VARCHAR(100),
    fodelsedatum     DATE,
    kon              CHAR(1) CHECK (kon IN ('M','K')),
    adress           VARCHAR(200),
    postnr           VARCHAR(10),
    postort          VARCHAR(100),
    telefon          VARCHAR(30),
    deceased_at      TIMESTAMP NULL,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_asynja_patients_pnr ON patients(personnummer);

-- ============================================================
-- encounters (öppenvård)
-- ============================================================
CREATE TABLE IF NOT EXISTS encounters (
    encounter_id         SERIAL PRIMARY KEY,
    patient_id           INTEGER NOT NULL REFERENCES patients(patient_id),
    visit_type           VARCHAR(20) DEFAULT 'OUTPATIENT',
    clinic_code          VARCHAR(40),
    clinic_name          VARCHAR(200),
    visit_doctor_hsa     VARCHAR(50),
    visit_doctor_name    VARCHAR(100),
    visit_date           TIMESTAMP NOT NULL,
    visit_reason         TEXT,
    status               VARCHAR(20) DEFAULT 'COMPLETED',
    created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_asynja_encounters_patient ON encounters(patient_id);
CREATE INDEX IF NOT EXISTS idx_asynja_encounters_date ON encounters(visit_date);

-- ============================================================
-- prescriptions (primärvårdsförskrivningar)
-- ============================================================
CREATE TABLE IF NOT EXISTS prescriptions (
    prescription_id         SERIAL PRIMARY KEY,
    patient_id              INTEGER NOT NULL REFERENCES patients(patient_id),
    encounter_id            INTEGER REFERENCES encounters(encounter_id),
    drug_name               VARCHAR(200),
    atc_code                VARCHAR(20),
    strength                VARCHAR(50),
    dosage                  VARCHAR(50),
    route                   VARCHAR(10),
    frequency               VARCHAR(20),
    start_date              DATE,
    end_date                DATE NULL,
    prescribing_doctor_hsa  VARCHAR(50),
    status                  VARCHAR(20) DEFAULT 'ACTIVE',
    created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_asynja_presc_patient ON prescriptions(patient_id);
CREATE INDEX IF NOT EXISTS idx_asynja_presc_atc ON prescriptions(atc_code);

-- ============================================================
-- diagnoses (kroniska diagnoser)
-- ============================================================
CREATE TABLE IF NOT EXISTS diagnoses (
    diagnosis_id      SERIAL PRIMARY KEY,
    patient_id        INTEGER NOT NULL REFERENCES patients(patient_id),
    encounter_id      INTEGER REFERENCES encounters(encounter_id),
    icd_code          VARCHAR(20),
    diagnosis_text    VARCHAR(500),
    diagnosis_type    VARCHAR(20) DEFAULT 'CHRONIC',
    diagnosed_by_hsa  VARCHAR(50),
    diagnosed_at      TIMESTAMP NOT NULL,
    resolved_at       TIMESTAMP NULL,
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_asynja_diag_patient ON diagnoses(patient_id);
CREATE INDEX IF NOT EXISTS idx_asynja_diag_icd ON diagnoses(icd_code);

-- ============================================================
-- allergies
-- ============================================================
CREATE TABLE IF NOT EXISTS allergies (
    allergy_id        SERIAL PRIMARY KEY,
    patient_id        INTEGER NOT NULL REFERENCES patients(patient_id),
    allergen          VARCHAR(200),
    reaction          VARCHAR(200),
    severity          VARCHAR(20),
    verified          BOOLEAN DEFAULT FALSE,
    reported_by_hsa   VARCHAR(50),
    reported_at       TIMESTAMP,
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_asynja_allergies_patient ON allergies(patient_id);

-- ============================================================
-- DEBEZIUM — logical replication setup
-- ============================================================

DROP PUBLICATION IF EXISTS asynja_pub;
CREATE PUBLICATION asynja_pub FOR ALL TABLES;

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'debezium_reader') THEN
        CREATE ROLE debezium_reader WITH LOGIN REPLICATION PASSWORD 'debezium';
    END IF;
END $$;

GRANT SELECT ON ALL TABLES IN SCHEMA public TO debezium_reader;
GRANT USAGE ON SCHEMA public TO debezium_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO debezium_reader;

ALTER TABLE patients       REPLICA IDENTITY FULL;
ALTER TABLE encounters     REPLICA IDENTITY FULL;
ALTER TABLE prescriptions  REPLICA IDENTITY FULL;
ALTER TABLE diagnoses      REPLICA IDENTITY FULL;
ALTER TABLE allergies      REPLICA IDENTITY FULL;
