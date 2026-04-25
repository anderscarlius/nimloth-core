-- Nimloth Core interna tabeller + FHIR-materialisering.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- audit_log (PDL-kompatibel åtkomstlogg, 10 års retention)
-- Schema enligt Prompt 9.
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_log (
    audit_id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id             VARCHAR(100) UNIQUE,
    timestamp            TIMESTAMPTZ NOT NULL,
    actor_hsa_id         VARCHAR(50),
    actor_name           VARCHAR(100),
    actor_role           VARCHAR(50),
    action               VARCHAR(50),        -- READ, SEARCH, CREATE, UPDATE, DELETE, EXPORT
    resource_type        VARCHAR(50),
    resource_id          VARCHAR(100),
    patient_personnummer VARCHAR(13),
    care_unit            VARCHAR(100),
    purpose              VARCHAR(50),        -- CARE, EMERGENCY, QUALITY_REGISTRY, ...
    legal_basis          VARCHAR(50),        -- PDL_2_4 (vårdrelation), PDL_4_1 (nödöppning)
    outcome              VARCHAR(50),        -- SUCCESS, DENIED_*, EMERGENCY_ACCESS, ERROR
    source_ip            VARCHAR(45),
    user_agent           TEXT,
    request_id           VARCHAR(100),
    details              JSONB,
    created_at           TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor_hsa_id);
CREATE INDEX IF NOT EXISTS idx_audit_patient ON audit_log(patient_personnummer);
CREATE INDEX IF NOT EXISTS idx_audit_outcome ON audit_log(outcome);
CREATE INDEX IF NOT EXISTS idx_audit_emergency
  ON audit_log(timestamp DESC) WHERE outcome = 'EMERGENCY_ACCESS';

-- ============================================================
-- patient_index (cross-system)
-- ============================================================
CREATE TABLE IF NOT EXISTS patient_index (
    patient_index_id   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    personnummer       VARCHAR(13) UNIQUE NOT NULL,
    fornamn            VARCHAR(100),
    efternamn          VARCHAR(100),
    fodelsedatum       DATE,
    kon                CHAR(1),
    source_systems     TEXT[] DEFAULT '{}',
    spar_status        BOOLEAN DEFAULT FALSE,
    spar_for_hsas      TEXT[] DEFAULT '{}',
    updated_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_patient_index_pnr ON patient_index(personnummer);

CREATE TABLE IF NOT EXISTS system_status (
    status_id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    service_name     VARCHAR(50) NOT NULL,
    instance_id      VARCHAR(20),
    status           VARCHAR(20),
    reported_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metrics          JSONB
);
CREATE INDEX IF NOT EXISTS idx_status_service ON system_status(service_name);

CREATE TABLE IF NOT EXISTS quality_metrics (
    metric_id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    metric_name      VARCHAR(100),
    metric_value     DECIMAL(12,4),
    source_system    VARCHAR(50),
    measured_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    details          JSONB
);

-- ============================================================
-- FHIR-MATERIALISERING
-- Populeras från core.clinical.* topics av fhir-facade materializer.
-- Hybrid modell: indexerade kolumner för sökning + event_data JSONB för rendering.
-- ============================================================

-- fhir_patients (dedupliserad från Melior + AsynjaVisph)
CREATE TABLE IF NOT EXISTS fhir_patients (
    personnummer      VARCHAR(13) PRIMARY KEY,
    fornamn           VARCHAR(100),
    efternamn         VARCHAR(100),
    fodelsedatum      DATE,
    kon               CHAR(1),
    adress            VARCHAR(200),
    postnr            VARCHAR(10),
    postort           VARCHAR(100),
    telefon           VARCHAR(30),
    source_systems    TEXT[] DEFAULT '{}',
    updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- fhir_encounters
CREATE TABLE IF NOT EXISTS fhir_encounters (
    encounter_ref     VARCHAR(100) PRIMARY KEY,
    patient_pnr       VARCHAR(13) NOT NULL,
    encounter_type    VARCHAR(20),
    department_code   VARCHAR(40),
    department_name   VARCHAR(200),
    admission_date    TIMESTAMP,
    discharge_date    TIMESTAMP,
    status            VARCHAR(20),
    source_system     VARCHAR(50),
    event_data        JSONB NOT NULL,
    updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_enc_patient ON fhir_encounters(patient_pnr);
CREATE INDEX IF NOT EXISTS idx_enc_admission ON fhir_encounters(admission_date);

-- fhir_observations (vitala + labb kombinerat)
CREATE TABLE IF NOT EXISTS fhir_observations (
    observation_id    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id          VARCHAR(100) UNIQUE,
    patient_pnr       VARCHAR(13) NOT NULL,
    category          VARCHAR(30),            -- 'vital-signs', 'laboratory'
    code_system       VARCHAR(100),
    code              VARCHAR(50),
    display           VARCHAR(200),
    value_numeric     DECIMAL(14,4),
    value_text        TEXT,
    unit              VARCHAR(50),
    effective_at      TIMESTAMP,
    encounter_ref     VARCHAR(100),
    source_system     VARCHAR(50),
    event_data        JSONB NOT NULL,
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_obs_patient ON fhir_observations(patient_pnr);
CREATE INDEX IF NOT EXISTS idx_obs_category ON fhir_observations(category);
CREATE INDEX IF NOT EXISTS idx_obs_code ON fhir_observations(code);
CREATE INDEX IF NOT EXISTS idx_obs_effective ON fhir_observations(effective_at DESC);

-- fhir_medication_statements
CREATE TABLE IF NOT EXISTS fhir_medication_statements (
    medication_id     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id          VARCHAR(100) UNIQUE,
    patient_pnr       VARCHAR(13) NOT NULL,
    atc_code          VARCHAR(20),
    drug_name         VARCHAR(200),
    strength          VARCHAR(50),
    dosage            VARCHAR(50),
    route             VARCHAR(10),
    frequency         VARCHAR(20),
    start_date        DATE,
    end_date          DATE,
    status            VARCHAR(20),
    encounter_ref     VARCHAR(100),
    source_system     VARCHAR(50),
    event_data        JSONB NOT NULL,
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_med_patient ON fhir_medication_statements(patient_pnr);
CREATE INDEX IF NOT EXISTS idx_med_status ON fhir_medication_statements(status);
CREATE INDEX IF NOT EXISTS idx_med_atc ON fhir_medication_statements(atc_code);

-- fhir_conditions (diagnoser)
CREATE TABLE IF NOT EXISTS fhir_conditions (
    condition_id      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id          VARCHAR(100) UNIQUE,
    patient_pnr       VARCHAR(13) NOT NULL,
    icd_code          VARCHAR(20),
    display           VARCHAR(500),
    diagnosis_type    VARCHAR(20),
    onset_at          TIMESTAMP,
    resolved_at       TIMESTAMP,
    encounter_ref     VARCHAR(100),
    source_system     VARCHAR(50),
    event_data        JSONB NOT NULL,
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_cond_patient ON fhir_conditions(patient_pnr);
CREATE INDEX IF NOT EXISTS idx_cond_icd ON fhir_conditions(icd_code);

-- fhir_procedures (INKL IMPLANTAT — kritiskt för Fru Andersson)
CREATE TABLE IF NOT EXISTS fhir_procedures (
    procedure_id      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id          VARCHAR(100) UNIQUE,
    patient_pnr       VARCHAR(13) NOT NULL,
    code_system       VARCHAR(100),
    code              VARCHAR(50),
    display           VARCHAR(200),
    kva_code          VARCHAR(20),
    laterality        VARCHAR(10),
    implant_type      VARCHAR(30),
    implant_manufacturer VARCHAR(100),
    implant_model     VARCHAR(100),
    implant_size      VARCHAR(30),
    performer_hsa     VARCHAR(50),
    procedure_date    TIMESTAMP,
    encounter_ref     VARCHAR(100),
    source_system     VARCHAR(50),
    event_data        JSONB NOT NULL,
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_proc_patient ON fhir_procedures(patient_pnr);
CREATE INDEX IF NOT EXISTS idx_proc_kva ON fhir_procedures(kva_code);

-- fhir_allergy_intolerances
CREATE TABLE IF NOT EXISTS fhir_allergy_intolerances (
    allergy_id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id          VARCHAR(100) UNIQUE,
    patient_pnr       VARCHAR(13) NOT NULL,
    allergen          VARCHAR(200),
    code_system       VARCHAR(100),
    code              VARCHAR(50),
    reaction          VARCHAR(200),
    severity          VARCHAR(20),
    verified          BOOLEAN,
    reported_at       TIMESTAMP,
    source_system     VARCHAR(50),
    event_data        JSONB NOT NULL,
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_allergy_patient ON fhir_allergy_intolerances(patient_pnr);

-- Ingen separat fhir_diagnostic_reports/fhir_care_plans-tabell i Del 7 —
-- DiagnosticReport byggs dynamiskt från fhir_observations (lab),
-- CarePlan returnerar tom searchset tills motsvarande events införs.

-- ============================================================
-- blocked_patients (PDL-spärr, används av middleware/pdl)
-- ============================================================
CREATE TABLE IF NOT EXISTS blocked_patients (
    personnummer     VARCHAR(13) PRIMARY KEY,
    blocked_for      TEXT[] DEFAULT '{}',
    reason           TEXT,
    blocked_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at       TIMESTAMP
);
