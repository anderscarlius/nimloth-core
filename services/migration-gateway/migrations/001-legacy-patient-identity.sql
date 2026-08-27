-- I5 (Spec_B4_Reversibel_Skrivvag_Anteckning_v0.1.md §5): identitetsmappningen
-- är explicit, testad, granskningsbar — inte en härledning i koden. Den
-- vanligaste tysta felkällan i verkliga migreringar.

CREATE TABLE IF NOT EXISTS legacy_patient_identity (
    patient_no  TEXT PRIMARY KEY,
    ehr_id      UUID NOT NULL UNIQUE,
    care_unit   TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
