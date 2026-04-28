-- Symbol-länk-aktig kopia av services/openehr-composer/migrations/001-create-openehr-ehr-cache.sql
-- för att uppfylla P3.1-specens repo-struktur (sektion 3).
-- Källan-of-truth är i services/openehr-composer/migrations/ — den körs
-- av composer-tjänsten vid startup. Denna kopia finns för dokumentations-
-- synlighet av openEHR-spårets schema-yta.

CREATE TABLE IF NOT EXISTS openehr_ehr_cache (
  patient_pnr  TEXT PRIMARY KEY,
  ehr_id       UUID NOT NULL UNIQUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_openehr_ehr_cache_created
  ON openehr_ehr_cache(created_at);
