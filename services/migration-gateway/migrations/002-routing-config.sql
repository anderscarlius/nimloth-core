-- Routingtabellen (Spec B4 §3): "(domän, enhet, riktning)". Denna etapp
-- (S0/S1) känner bara LEGACY_ONLY och SHADOW — S2/S3 är kommande etapper,
-- bygg inte dit (se B4 Etapp 1-promptens avgränsning).
--
-- Ingen cache i gatewayen — varje routingbeslut frågar denna tabell direkt.
-- Hot-reload är därför gratis: nästa request läser den nya raden, ingen
-- omstart. Trafikvolymen för ett bevis motiverar inte cache-komplexitet.

CREATE TABLE IF NOT EXISTS routing_config (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain      TEXT NOT NULL,
    care_unit   TEXT NOT NULL,
    direction   TEXT NOT NULL CHECK (direction IN ('LEGACY_ONLY', 'SHADOW')),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by  TEXT NOT NULL,
    UNIQUE (domain, care_unit)
);
