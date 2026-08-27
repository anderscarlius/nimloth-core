-- I2 (Spec B4 §5): auktoritetsproveniens per post. canonical_store finns
-- redan i PDL-auditens payload (P3.3), men tappas innan den når varaktig
-- lagring (services/audit:s audit_log-tabell saknar kolumnen — bekräftat
-- i Fas A-inventeringen). Denna tabell lyfter begreppet från audit till
-- datapost, precis som I2 kräver — utan att mutera vare sig legacy-
-- simulatorns rad (I1 skulle blockera det ändå) eller openEHR-
-- compositionen.

CREATE TABLE IF NOT EXISTS note_provenance (
    logical_note_id  UUID PRIMARY KEY,
    canonical_store  TEXT NOT NULL CHECK (canonical_store IN ('legacy', 'openehr')),
    set_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
