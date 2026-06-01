-- ============================================================
-- Del 2 (B4) — Sömmen: _source-kolumn på alla OMOP-tabeller
-- ============================================================
-- 'live_transform'  = projekterat från EHRbase via omop-projector (Del 1)
-- 'preloaded'       = pålastad bredd via synthetic-bulk-loader (Del 2)
--
-- Den enda frågan som spräcker demon: "kommer OMOP-datan ur er CDR, eller
-- är den pålastad?". Detta kolumnpar gör svaret SQL-frågbart.
-- ============================================================

-- Hjälp-domän för läsbarhet (postgres tillåter CHECK direkt på VARCHAR också)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'omop_source_kind') THEN
    CREATE TYPE omop.omop_source_kind AS ENUM ('live_transform', 'preloaded');
  END IF;
END $$;

-- Person -----------------------------------------------------------------
ALTER TABLE omop.person
  ADD COLUMN IF NOT EXISTS _source omop.omop_source_kind NOT NULL DEFAULT 'live_transform';
CREATE INDEX IF NOT EXISTS idx_person_source ON omop.person(_source);

-- Drug exposure ----------------------------------------------------------
ALTER TABLE omop.drug_exposure
  ADD COLUMN IF NOT EXISTS _source omop.omop_source_kind NOT NULL DEFAULT 'live_transform';
CREATE INDEX IF NOT EXISTS idx_drug_source ON omop.drug_exposure(_source);

-- Measurement ------------------------------------------------------------
-- (idx_measurement_source togs redan i migration 001 för composition_uid; nytt namn här)
ALTER TABLE omop.measurement
  ADD COLUMN IF NOT EXISTS _source omop.omop_source_kind NOT NULL DEFAULT 'live_transform';
CREATE INDEX IF NOT EXISTS idx_measurement_source_kind ON omop.measurement(_source);

-- Condition occurrence ---------------------------------------------------
ALTER TABLE omop.condition_occurrence
  ADD COLUMN IF NOT EXISTS _source omop.omop_source_kind NOT NULL DEFAULT 'live_transform';

-- Visit occurrence -------------------------------------------------------
ALTER TABLE omop.visit_occurrence
  ADD COLUMN IF NOT EXISTS _source omop.omop_source_kind NOT NULL DEFAULT 'live_transform';

-- Observation period -----------------------------------------------------
ALTER TABLE omop.observation_period
  ADD COLUMN IF NOT EXISTS _source omop.omop_source_kind NOT NULL DEFAULT 'live_transform';

-- ------------------------------------------------------------
-- Person_id-rymd: live = 1..999_999 (BIGSERIAL),
--                 preloaded = 1_000_000+
-- Sätt BIGSERIAL:s nästa värde på 1_000_000 efter bulk-loadens slut.
-- Bulk-loadern allokerar manuella IDs >=1_000_000 så inga kollisioner uppstår.
-- ------------------------------------------------------------

-- Lineage-vy uppdateras: inkludera _source
-- (DROP först eftersom CREATE OR REPLACE inte kan ändra kolumn-ordning/namn)
DROP VIEW IF EXISTS omop.v_lineage;
CREATE VIEW omop.v_lineage AS
SELECT 'drug_exposure'::text AS target_table, _source, _source_composition_uid,
       _source_archetype, _transform_version, _projected_at
  FROM omop.drug_exposure
UNION ALL
SELECT 'measurement'::text, _source, _source_composition_uid,
       _source_archetype, _transform_version, _projected_at
  FROM omop.measurement
UNION ALL
SELECT 'condition_occurrence'::text, _source, _source_composition_uid,
       _source_archetype, _transform_version, _projected_at
  FROM omop.condition_occurrence;

-- Snabbvy för demo-säkerhet: source-fördelning
DROP VIEW IF EXISTS omop.v_source_summary;
CREATE VIEW omop.v_source_summary AS
SELECT 'person'::text AS tbl, _source, COUNT(*) AS n FROM omop.person GROUP BY _source
UNION ALL
SELECT 'drug_exposure', _source, COUNT(*) FROM omop.drug_exposure GROUP BY _source
UNION ALL
SELECT 'measurement', _source, COUNT(*) FROM omop.measurement GROUP BY _source
ORDER BY tbl, _source;
