-- fhir-facade: parity_snapshots (Sprint 2 P3.4).
--
-- Mätserie för paritetsdiff mellan postgres-vägen och openehr-vägen.
-- En rad per (run_id, resource_type) — 6 rader per komplett run.
-- Fil-närvaro-versionerad migration (samma pattern som
-- openehr-composer/migrations/). Idempotent via IF NOT EXISTS.
--
-- Schema enligt nimloth-docs/P3.4_Paritetsdiff_Dashboard.md sektion 4.1.

CREATE TABLE IF NOT EXISTS parity_snapshots (
  id BIGSERIAL PRIMARY KEY,
  taken_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  run_id UUID NOT NULL,
  patient_pnr TEXT,
  resource_type TEXT NOT NULL CHECK (resource_type IN (
    'Patient', 'Observation', 'MedicationStatement',
    'Procedure', 'Condition', 'AllergyIntolerance'
  )),
  postgres_count INT NOT NULL,
  openehr_count INT NOT NULL,
  mismatch_count INT NOT NULL,
  only_in_postgres TEXT[],
  only_in_openehr TEXT[],
  field_coverage JSONB,
  trigger TEXT NOT NULL CHECK (trigger IN ('manual', 'scheduled', 'test')),
  canonicalisation_version INT NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_parity_snapshots_taken_at
  ON parity_snapshots(taken_at DESC);
CREATE INDEX IF NOT EXISTS idx_parity_snapshots_resource
  ON parity_snapshots(resource_type, taken_at DESC);
CREATE INDEX IF NOT EXISTS idx_parity_snapshots_run
  ON parity_snapshots(run_id);
