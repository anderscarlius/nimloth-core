-- ============================================================
-- Nimloth Kohortutforskaren — kohort-schema (Del 2 / B5)
-- ============================================================
-- Schema 'cohort' separat från 'omop' (CDM-konvention: cohort-tabellen är
-- visserligen del av OMOP, men vi håller demo-state i ett eget schema för
-- att kunna TRUNCATE den fritt utan att röra OMOP-CDM).
-- ============================================================

CREATE SCHEMA IF NOT EXISTS cohort;

-- ------------------------------------------------------------
-- cohort_definition — registrerade kohorter (named eller ad-hoc).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cohort.cohort_definition (
    cohort_definition_id   BIGSERIAL PRIMARY KEY,
    name                   VARCHAR(120) NOT NULL UNIQUE,
    description            TEXT,
    definition_sql         TEXT NOT NULL,           -- SELECT person_id, cohort_start_date FROM ...
    is_predefined          BOOLEAN NOT NULL DEFAULT FALSE,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- cohort — instantierade medlemmar (OMOP-konvention)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cohort.cohort (
    cohort_definition_id   BIGINT NOT NULL REFERENCES cohort.cohort_definition(cohort_definition_id) ON DELETE CASCADE,
    subject_id             BIGINT NOT NULL,        -- = omop.person.person_id
    cohort_start_date      DATE   NOT NULL,
    cohort_end_date        DATE,
    PRIMARY KEY (cohort_definition_id, subject_id, cohort_start_date)
);
CREATE INDEX IF NOT EXISTS idx_cohort_def ON cohort.cohort(cohort_definition_id);
CREATE INDEX IF NOT EXISTS idx_cohort_subject ON cohort.cohort(subject_id);

-- ------------------------------------------------------------
-- Seed: fördefinierade demo-kohorter
-- ------------------------------------------------------------
INSERT INTO cohort.cohort_definition (name, description, definition_sql, is_predefined)
VALUES
  (
    'warfarin_egfr_under_60',
    'Patienter med warfarin-användning OCH eGFR < 60 ml/min/1.73m² (njurfunktionsnedsättning) — knyter till medication-safety-fallet.',
    $$
    SELECT DISTINCT
      d.person_id          AS subject_id,
      MIN(d.drug_exposure_start_date) AS cohort_start_date
    FROM omop.drug_exposure d
    WHERE d.drug_source_value = 'B01AA03'  -- Warfarin
      AND d.person_id IN (
        SELECT m.person_id
        FROM omop.measurement m
        WHERE m.measurement_source_value IN ('EGFR', 'eGFR', 'GFR')
          AND m.value_as_number < 60
      )
    GROUP BY d.person_id
    $$,
    TRUE
  ),
  (
    'diabetes_t2_metformin',
    'Patienter med Metformin (A10BA02) — proxy för typ 2-diabetes-behandling.',
    $$
    SELECT
      d.person_id          AS subject_id,
      MIN(d.drug_exposure_start_date) AS cohort_start_date
    FROM omop.drug_exposure d
    WHERE d.drug_source_value = 'A10BA02'
    GROUP BY d.person_id
    $$,
    TRUE
  ),
  (
    'hba1c_elevated',
    'Patienter med HbA1c ≥ 53 mmol/mol (icke-välkontrollerad diabetes).',
    $$
    SELECT
      m.person_id          AS subject_id,
      MIN(m.measurement_date) AS cohort_start_date
    FROM omop.measurement m
    WHERE m.measurement_source_value = 'HBA1C'
      AND m.value_as_number >= 53
    GROUP BY m.person_id
    $$,
    TRUE
  )
ON CONFLICT (name) DO NOTHING;
