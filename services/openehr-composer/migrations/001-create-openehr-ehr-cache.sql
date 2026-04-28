-- openEHR-composer: ehr-cache (Sprint 2 P3.1).
-- Mappar svenskt personnummer till EHRbase EHR-id (UUID). Används av
-- composern för att samma patient alltid får samma EHR — så
-- composition-skrivning kan göras idempotent och AQL-frågor kan
-- bygga på stabil identitet över flera events.

CREATE TABLE IF NOT EXISTS openehr_ehr_cache (
  patient_pnr  TEXT PRIMARY KEY,
  ehr_id       UUID NOT NULL UNIQUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_openehr_ehr_cache_created
  ON openehr_ehr_cache(created_at);
