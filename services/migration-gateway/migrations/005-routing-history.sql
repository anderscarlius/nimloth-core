-- B4 Etapp 2, Grind 1 punkt (d): routingtillstånd (routing_config, Etapp
-- 1) räcker inte för auktoritetsproveniens över TID — bara "vad gäller
-- nu", inte "vad gällde den 14:e?". Ersatt (inte kompletterad) med en
-- append-only historik: nuvarande läge är helt enkelt historikens
-- senaste rad. Att hålla två tabeller (nuvarande-cache + historik)
-- synkade är en extra felyta för noll vinst.
--
-- NIMLOTH läggs till som tredje riktning (S2: Nimloth auktoritativ,
-- legacy skuggas — den omvända riktningen mot S1).
--
-- migrate() (src/db.ts) kör varje .sql-fil vid varje uppstart utan
-- migreringsspårningstabell (CREATE IF NOT EXISTS-mönstret). Blocket
-- nedan måste därför vara säkert att köra om: det migrerar
-- routing_config EN gång (om tabellen fortfarande finns) och droppar
-- den sedan — på en ny databas (CI:s postgres-container, eller en
-- lokal databas som redan kört denna migration) finns routing_config
-- aldrig, och blocket no-opar.

CREATE TABLE IF NOT EXISTS routing_history (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain      TEXT NOT NULL,
    care_unit   TEXT NOT NULL,
    direction   TEXT NOT NULL CHECK (direction IN ('LEGACY_ONLY', 'SHADOW', 'NIMLOTH')),
    changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    changed_by  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS routing_history_lookup_idx
    ON routing_history (domain, care_unit, changed_at DESC);

DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'routing_config') THEN
        INSERT INTO routing_history (domain, care_unit, direction, changed_at, changed_by)
        SELECT domain, care_unit, direction, updated_at, updated_by FROM routing_config;
        DROP TABLE routing_config;
    END IF;
END $$;
