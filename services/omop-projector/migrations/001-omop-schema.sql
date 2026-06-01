-- ============================================================
-- Nimloth OMOP CDM v5.4 — minimal projekterings-schema (Del 1)
-- ============================================================
-- Källa: openEHR-kompositioner i EHRbase. INGEN LLM.
-- Transform-version stämplas per rad i kolumnen `_transform_version`.
-- Composition UID stämplas i `_source_composition_uid`.
--
-- Två tabeller fylls i Del 1:
--   * drug_exposure   ← medication_summary.v1
--   * measurement     ← laboratory_test_result.v1
-- Övriga (person, observation_period, condition_occurrence, visit_occurrence)
-- är skelett för Del 2/3 och fylls minimalt här för referentiell integritet.
--
-- TOLERANS: source_value-kolumner accepteras när target-vokabulär saknas
-- (RxNorm/LOINC/SNOMED-mapping är ej i scope för Del 1).
-- ============================================================

CREATE SCHEMA IF NOT EXISTS omop;

-- ------------------------------------------------------------
-- person
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS omop.person (
    person_id                BIGSERIAL PRIMARY KEY,
    person_source_value      VARCHAR(64) NOT NULL UNIQUE,   -- patient-id från EHRbase (ehr_status.subject.external_ref.id)
    gender_concept_id        INTEGER,                       -- ej fylld i Del 1
    year_of_birth            INTEGER,                       -- ej fylld i Del 1
    gender_source_value      VARCHAR(16),                   -- ej fylld i Del 1
    _ehr_id                  VARCHAR(64),                   -- EHRbase EHR-UID (intern lineage)
    _created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    _transform_version       VARCHAR(32) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_person_source_value ON omop.person(person_source_value);

-- ------------------------------------------------------------
-- observation_period (krävs av OMOP-konvention; ett intervall per person)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS omop.observation_period (
    observation_period_id    BIGSERIAL PRIMARY KEY,
    person_id                BIGINT NOT NULL REFERENCES omop.person(person_id) ON DELETE CASCADE,
    observation_period_start_date DATE NOT NULL,
    observation_period_end_date   DATE NOT NULL,
    period_type_concept_id   INTEGER NOT NULL DEFAULT 0,
    _transform_version       VARCHAR(32) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_obs_period_person ON omop.observation_period(person_id);

-- ------------------------------------------------------------
-- drug_exposure (← openEHR-EHR-EVALUATION.medication_summary.v1)
-- En rad per EVALUATION.medication_summary i en composition.
-- ATC-kod degraderas till drug_source_value (RxNorm saknas i Del 1).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS omop.drug_exposure (
    drug_exposure_id         BIGSERIAL PRIMARY KEY,
    person_id                BIGINT NOT NULL REFERENCES omop.person(person_id) ON DELETE CASCADE,
    drug_concept_id          INTEGER NOT NULL DEFAULT 0,    -- 0 = ingen target-mapping (degraderat)
    drug_exposure_start_date DATE NOT NULL,
    drug_exposure_start_datetime TIMESTAMPTZ,
    drug_exposure_end_date   DATE,
    drug_type_concept_id     INTEGER NOT NULL DEFAULT 32817, -- "EHR" (OMOP-konvention)
    drug_source_value        VARCHAR(50),                   -- ATC-kod (degradering)
    drug_source_concept_id   INTEGER NOT NULL DEFAULT 0,
    route_source_value       VARCHAR(50),
    sig                      TEXT,                          -- fri text (dosering / kommentar)
    _source_composition_uid  VARCHAR(120) NOT NULL,
    _source_archetype        VARCHAR(120) NOT NULL,
    _transform_version       VARCHAR(32) NOT NULL,
    _projected_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (_source_composition_uid, drug_source_value, drug_exposure_start_date)
);
CREATE INDEX IF NOT EXISTS idx_drug_exposure_person ON omop.drug_exposure(person_id);
CREATE INDEX IF NOT EXISTS idx_drug_exposure_atc ON omop.drug_exposure(drug_source_value);
CREATE INDEX IF NOT EXISTS idx_drug_exposure_source ON omop.drug_exposure(_source_composition_uid);

-- ------------------------------------------------------------
-- measurement (← openEHR-EHR-OBSERVATION.laboratory_test_result.v1)
-- En rad per analyte_result i en composition.
-- analyte_code degraderas till measurement_source_value (LOINC saknas i Del 1).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS omop.measurement (
    measurement_id           BIGSERIAL PRIMARY KEY,
    person_id                BIGINT NOT NULL REFERENCES omop.person(person_id) ON DELETE CASCADE,
    measurement_concept_id   INTEGER NOT NULL DEFAULT 0,    -- 0 = ingen target-mapping (degraderat)
    measurement_date         DATE NOT NULL,
    measurement_datetime     TIMESTAMPTZ NOT NULL,
    measurement_type_concept_id INTEGER NOT NULL DEFAULT 32817, -- "EHR"
    value_as_number          NUMERIC,
    unit_source_value        VARCHAR(50),
    measurement_source_value VARCHAR(50),                   -- analyte_code (degradering)
    measurement_source_concept_id INTEGER NOT NULL DEFAULT 0,
    value_source_value       TEXT,                          -- fri text om DV_TEXT
    _source_composition_uid  VARCHAR(120) NOT NULL,
    _source_archetype        VARCHAR(120) NOT NULL,
    _transform_version       VARCHAR(32) NOT NULL,
    _projected_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (_source_composition_uid, measurement_source_value, measurement_datetime)
);
CREATE INDEX IF NOT EXISTS idx_measurement_person ON omop.measurement(person_id);
CREATE INDEX IF NOT EXISTS idx_measurement_code ON omop.measurement(measurement_source_value);
CREATE INDEX IF NOT EXISTS idx_measurement_source ON omop.measurement(_source_composition_uid);

-- ------------------------------------------------------------
-- condition_occurrence (skelett — fylls i Del 2/3)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS omop.condition_occurrence (
    condition_occurrence_id  BIGSERIAL PRIMARY KEY,
    person_id                BIGINT NOT NULL REFERENCES omop.person(person_id) ON DELETE CASCADE,
    condition_concept_id     INTEGER NOT NULL DEFAULT 0,
    condition_start_date     DATE NOT NULL,
    condition_type_concept_id INTEGER NOT NULL DEFAULT 32817,
    condition_source_value   VARCHAR(50),
    _source_composition_uid  VARCHAR(120) NOT NULL,
    _source_archetype        VARCHAR(120) NOT NULL,
    _transform_version       VARCHAR(32) NOT NULL,
    _projected_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_condition_person ON omop.condition_occurrence(person_id);

-- ------------------------------------------------------------
-- visit_occurrence (skelett — fylls i Del 2/3)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS omop.visit_occurrence (
    visit_occurrence_id      BIGSERIAL PRIMARY KEY,
    person_id                BIGINT NOT NULL REFERENCES omop.person(person_id) ON DELETE CASCADE,
    visit_concept_id         INTEGER NOT NULL DEFAULT 0,
    visit_start_date         DATE NOT NULL,
    visit_end_date           DATE NOT NULL,
    visit_type_concept_id    INTEGER NOT NULL DEFAULT 32817,
    visit_source_value       VARCHAR(50),
    _source_composition_uid  VARCHAR(120),
    _transform_version       VARCHAR(32) NOT NULL,
    _projected_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_visit_person ON omop.visit_occurrence(person_id);

-- ------------------------------------------------------------
-- Lineage-vy: vilka composition-UIDs ligger bakom OMOP-rader
-- (används av eval-runnern för täckningsrapport)
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW omop.v_lineage AS
SELECT 'drug_exposure'::text AS target_table, _source_composition_uid, _source_archetype, _transform_version, _projected_at
  FROM omop.drug_exposure
UNION ALL
SELECT 'measurement'::text, _source_composition_uid, _source_archetype, _transform_version, _projected_at
  FROM omop.measurement
UNION ALL
SELECT 'condition_occurrence'::text, _source_composition_uid, _source_archetype, _transform_version, _projected_at
  FROM omop.condition_occurrence;
