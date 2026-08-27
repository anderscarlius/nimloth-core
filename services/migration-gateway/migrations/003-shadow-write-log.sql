-- Skuggskrivningsloggen. Två syften:
--   1. Felspårning — vad hände när skuggskrivningen till EHRbase gjordes.
--   2. Idempotensnyckel (I4) — UNIQUE(legacy_note_id) betyder att ett
--      omkört skuggskrivningsförsök för samma legacy-post upptäcks och
--      hoppas över (eller rapporteras), aldrig dubbelskrivs.
--
-- Grind 1-amendemang 2026-08-19: paritetsrunnern ska konsultera denna
-- tabell så en diff kan skilja "kom aldrig fram" (status='FAILED' eller
-- ingen rad alls här) från "kom fram och skiljer sig" (status='SUCCESS'
-- men innehållet ändå avviker vid jämförelse). Utan detta ser båda
-- fallen likadana ut för paritetsdiffen — en riktig avvikelse och en
-- känd, redan loggad leveransmiss skulle blandas ihop.

CREATE TABLE IF NOT EXISTS shadow_write_log (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legacy_note_id    UUID NOT NULL UNIQUE,
    ehr_id            UUID NOT NULL,
    status            TEXT NOT NULL CHECK (status IN ('SUCCESS', 'FAILED')),
    composition_uid   TEXT NULL,
    error_detail      TEXT NULL,
    attempted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS shadow_write_log_ehr_id_idx ON shadow_write_log (ehr_id);
