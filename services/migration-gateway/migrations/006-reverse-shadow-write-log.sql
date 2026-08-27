-- B4 Etapp 2 — S2:s spegelbild av shadow_write_log (Etapp 1). I S2 är
-- Nimloth auktoritativ; legacy skuggas. Ett fel här är inte bara en
-- felrad — det är en skuld mot en framtida S2→S3-återgång (Grind 1
-- punkt f): återgångstid = växlingstid + (skuld × replay-latens).
--
-- composition_uid (fullständig, versionerad EHRbase-uid) är
-- idempotensnyckeln (I4, spegelvänd): UNIQUE(composition_uid) —
-- enklast möjliga "deterministiska härledning", identitetsfunktionen.
-- Ingen klient-satt legacy-id är möjlig: nimloth-legacy-sims POST
-- /notes genererar sitt eget id (gen_random_uuid()) och får inte ändras
-- att acceptera ett — det vore affärslogik i simulatorn, förbjudet av
-- S2-taket (D4/D6).
--
-- vo_id (compositionens rotidentitet, delen före '::') är den publika
-- logiska anteckningsidentiteten för Nimloth-födda poster — samma roll
-- legacy_note_id spelar för legacy-födda poster i note_provenance.
--
-- note_text/note_created_at är denormaliserade (inte en live AQL-
-- läsning) med avsikt: de gör den sammanslagna läsvyn (Grind 1 fynd i)
-- billig för det vanliga fallet, på bekostnad av att bära samma data
-- på två ställen. Motiverat av att undvika att bygga en generell
-- läs-genom-AQL-mekanism för ett enda vy-behov (S7 — ingen verktygslåda).

CREATE TABLE IF NOT EXISTS reverse_shadow_write_log (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    composition_uid   TEXT NOT NULL UNIQUE,
    vo_id             UUID NOT NULL,
    ehr_id            UUID NOT NULL,
    patient_no        TEXT NOT NULL,
    care_unit         TEXT NOT NULL,
    note_text         TEXT NOT NULL,
    note_created_at   TIMESTAMPTZ NOT NULL,
    legacy_note_id    UUID NULL,
    status            TEXT NOT NULL CHECK (status IN ('SUCCESS', 'FAILED')),
    error_detail      TEXT NULL,
    duration_ms       INTEGER NOT NULL,
    attempted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS reverse_shadow_write_log_ehr_id_idx ON reverse_shadow_write_log (ehr_id);
