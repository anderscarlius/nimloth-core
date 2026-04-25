# Extending: anslut ett nytt källsystem

Den här guiden beskriver **steg för steg** hur du ansluter ett nytt källsystem (t.ex. FlexLab, Klinisk Portal, en ny Melior‑instans i Skaraborg) till Nimloth Core. Följ stegen i ordning — varje steg verifieras innan nästa påbörjas. Hela ryggen (Kafka, Debezium, FHIR Facade, dashboard) är redan på plats; det du lägger till är **anslutningen + översättningen**.

Exemplet använder ett fiktivt **FlexLab**‑system (labb‑svar från Unilabs/Aleris) som kör PostgreSQL med en tabell `flexlab.results`.

---

## Steg 1 — Inventera källdatabasens schema

Målet: förstå **vilka tabeller som bär klinisk information**, hur de länkar till patient/vårdkontakt, och vilka koder/terminologier de använder.

Checklista:

- [ ] Tabellnamn + primärnycklar
- [ ] Patientreferens (pnr, lokalt id, eller annan nyckel?)
- [ ] Vårdkontaktsreferens (om finns — annars måste du länka via datum+pnr)
- [ ] Kodsystem: lokal kod, SNOMED, LOINC, ICD‑10, ATC?
- [ ] Tidsstämplar: när hände händelsen vs. när loggades den?
- [ ] Mutation/radering: uppdateras rader eller är de append‑only?

För FlexLab‑exemplet:

```sql
-- flexlab.results
id              SERIAL PRIMARY KEY
order_number    VARCHAR(32)
patient_pnr     VARCHAR(12)                -- referens till central pnr
analyte_code    VARCHAR(32)                -- t.ex. "S-KREATININ"
loinc_code      VARCHAR(16)                -- t.ex. "14682-9"
value_numeric   NUMERIC(10,3)
value_text      TEXT
unit            VARCHAR(16)
reference_low   NUMERIC(10,3)
reference_high  NUMERIC(10,3)
flag            VARCHAR(8)                  -- "H"/"L"/NULL
sampled_at      TIMESTAMPTZ
reported_at     TIMESTAMPTZ
ordering_hsa    VARCHAR(32)
```

**Fäll** — om tabellen saknar `updated_at` måste du luta dig mot Debezium's LSN istället för timestamps för att detektera ordning.

---

## Steg 2 — Förbered Debezium‑connector

Alla källsystem (inkl. nya) ska anslutas via Debezium. Det är tre saker som behövs:

1. **Logical replication** på källdatabasen — `wal_level=logical`, `max_wal_senders`, `max_replication_slots` (samma inställning som vi satt för Melior i `docker-compose.yml`, rad 20–27).
2. En **dedicated user** med `REPLICATION`‑rätt och SELECT på tabellerna du vill CDC:a.
3. En **publication** (Postgres 10+):

   ```sql
   CREATE PUBLICATION flexlab_pub FOR TABLE flexlab.results;
   ```

   Debezium kan skapa publication automatiskt med `publication.autocreate.mode=all_tables`, men i produktion vill du ha explicit kontroll.

Lägg till connector‑registrering i `infra/debezium/register-connectors.sh`:

```bash
register_connector "flexlab-connector" '{
  "connector.class": "io.debezium.connector.postgresql.PostgresConnector",
  "database.hostname": "flexlab-db",
  "database.port": "5432",
  "database.user": "flexlab_cdc",
  "database.password": "flexlab_cdc",
  "database.dbname": "flexlab",
  "database.server.name": "flexlab",
  "plugin.name": "pgoutput",
  "publication.name": "flexlab_pub",
  "slot.name": "flexlab_slot",
  "topic.prefix": "vgr.cdc.flexlab",
  "table.include.list": "flexlab.results",
  "decimal.handling.mode": "double",
  "time.precision.mode": "connect",
  "heartbeat.interval.ms": "10000",
  "snapshot.mode": "initial"
}'
```

**Namnkonvention:** `vgr.cdc.<system>.<instance>.<schema>.<table>`. För FlexLab (som är en central tjänst, inte per sjukhus) räcker det med `vgr.cdc.flexlab.public.results`.

**Instans‑stöd från start:** om FlexLab rullas ut per sjukhus någon dag, lägg `INSTANCE_ID`‑env i din connector‑script nu — precis som vi gjort för Melior i Del 5.

Verifiera:

```bash
./infra/debezium/register-connectors.sh
curl -s http://localhost:8083/connectors/flexlab-connector/status | jq '.connector.state'
# → "RUNNING"
```

---

## Steg 3 — Skapa Kafka‑topic

Lägg till i `infra/kafka/create-topics.sh`:

```bash
echo "== Debezium per-tabell (FlexLab) =="
create_topic "vgr.cdc.flexlab.public.results" 3 "${RET_90D}"

echo "== Clinical: FlexLab adds to existing topic =="
# Återanvänd existerande core.clinical.lab.result — vi skickar dit från transform.
```

**Principen:** *råa CDC‑topics är per källsystem, domän‑topics är system‑agnostiska.* `core.clinical.lab.result` innehåller redan labbsvar från Melior‑tabellen `lab_results` — FlexLab‑svaren ska också hamna där. Konsumenterna (FHIR‑materializer, CDS‑regler) bryr sig inte om ursprunget; bara om semantiken.

Kör:

```bash
docker compose exec kafka /opt/kafka/create-topics.sh
```

Den är idempotent — existerande topics rörs inte.

---

## Steg 4 — Skriv en transform‑mappare

Skapa `services/transform/src/mappings/flexlab-results.ts` efter mönstret från `lab-results.ts`:

```typescript
import type { Mapper } from './helpers.js';
import { resolvePatientRef } from './helpers.js';

export const flexlabResultsMapper: Mapper = {
  inputTopic: 'vgr.cdc.flexlab.public.results',
  outputTopic: 'core.clinical.lab.result',

  async map(event, { patientCache, terminology }) {
    if (event.op === 'd') return null;  // ignorera deletes för labbsvar
    const row = event.after;

    const patientRef = await resolvePatientRef(row.patient_pnr, patientCache);
    if (!patientRef) return { skipReason: 'patient-not-found' };

    return {
      eventType: 'core.clinical.lab.result',
      eventId: `flexlab:${row.id}`,
      sourceInstance: 'flexlab',              // <-- identifiera ursprung
      occurredAt: row.sampled_at,
      receivedAt: row.reported_at,
      patient: patientRef,
      code: {
        system: 'http://loinc.org',
        code: row.loinc_code,
        display: row.analyte_code,
      },
      valueQuantity: row.value_numeric != null
        ? { value: row.value_numeric, unit: row.unit }
        : undefined,
      valueString: row.value_text ?? undefined,
      referenceRange: {
        low: row.reference_low,
        high: row.reference_high,
        unit: row.unit,
      },
      interpretation: row.flag ?? null,
      performer: row.ordering_hsa,
    };
  },
};
```

Registrera i `services/transform/src/mappings/index.ts`:

```typescript
import { flexlabResultsMapper } from './flexlab-results.js';
export const mappers = [
  // … befintliga mappers …
  flexlabResultsMapper,
];
```

**Patient‑cache:** om FlexLab använder annan patientnyckel än pnr, utvidga `patient-cache.ts` med en alternativ lookup‑index. För FlexLab i exemplet räcker pnr → `Patient/<internal_id>`.

**Tester:** skapa `services/transform/src/__tests__/flexlab-results.test.ts` med minst 3 fall:

1. Normal insert → korrekt mappning.
2. Okänd patient → `skipReason`.
3. `value_text` utan `value_numeric` → mappning till `valueString`.

```bash
pnpm --filter @nimloth-core/transform test
```

---

## Steg 5 — Registrera i FHIR Facade

Oftast behöver du **inte** ändra FHIR Facade — materializern skriver redan `DiagnosticReport` + `Observation` från `core.clinical.lab.result`.

Men om ditt nya källsystem bär en ny resurstyp (t.ex. `Immunization` från SMI‑registret, eller `DeviceUseStatement` från ett implantatregister):

1. Lägg till resurshanterare i `services/fhir-facade/src/resources/<resource>.ts` (kopiera från `observation.ts`).
2. Registrera route i `services/fhir-facade/src/server.ts`.
3. Skapa tabell i `infra/postgres/init-core.sql` + migrering.
4. Uppdatera materializer (`services/fhir-facade/src/materializer.ts`) att lyssna på nytt topic → skriv till DB.
5. Komplett ny resurs → uppdatera `$everything` i `services/fhir-facade/src/operations/everything.ts` att inkludera den.

Verifiera:

```bash
docker compose build fhir-facade transform
docker compose up -d fhir-facade transform
# Insert i källsystemet:
docker compose exec flexlab-db psql -U flexlab -d flexlab \
  -c "INSERT INTO flexlab.results (order_number, patient_pnr, loinc_code, analyte_code, value_numeric, unit, sampled_at, reported_at) VALUES ('O123','19500315-2384','2160-0','Krea',85,'umol/L',NOW(),NOW());"
sleep 3
curl -s "http://localhost:3003/fhir/r4/Observation?patient=Patient/1&code=http://loinc.org|2160-0" | jq
```

---

## Steg 6 — Skapa CDS‑regler (om relevant)

Om det nya källsystemet ger klinisk information som kan trigga beslutsstöd — t.ex. *kritiskt hög kalium från FlexLab* → varning vid läkemedelsordination — lägg till en ny regel i `services/cds-hooks/src/rules/`:

```typescript
// services/cds-hooks/src/rules/hyperkalemia.ts
import type { Rule } from './index.js';

export const hyperkalemiaRule: Rule = {
  id: 'core-hyperkalemia',
  hook: ['medication-prescribe', 'order-select'],
  title: 'Hyperkalemi‑risk',
  description: 'Varnar vid förskrivning av kaliumsparare hos patient med hyperkalemi',

  async evaluate(context, fhirClient) {
    const labs = await fhirClient.getObservations(
      context.patientId,
      { code: '2823-3' /* LOINC K */, limit: 5 }
    );
    const latest = labs[0];
    if (!latest || latest.valueQuantity.value < 5.5) return [];

    return [{
      indicator: 'critical',
      summary: `Hyperkalemi (K ${latest.valueQuantity.value} mmol/L) — överväg alternativ`,
      detail: `…`,
      source: { label: 'VGR CDS · Hyperkalemi' },
    }];
  },
};
```

Registrera i `services/cds-hooks/src/rules/index.ts` och skapa motsvarande service i `/cds-services`‑listan.

Testa:

```bash
pnpm --filter @nimloth-core/cds-hooks test
curl -s -X POST http://localhost:3004/cds-services/core-hyperkalemia \
  -H "Content-Type: application/json" \
  -d '{"hookInstance":"t","hook":"medication-prescribe","context":{"userId":"Practitioner/1","patientId":"Patient/1"}}'
```

---

## Steg 7 — Verifiera med reconciliation‑engine

(Planerad för framtida del, ej implementerad i PoC:n.) Tanken:

- Räkna rader per tabell i källsystem.
- Räkna matchande events i canonical store.
- Jämför: differens < 0,1 % → OK.
- Differens > 0,1 % → larma på `core.system.errors` + mejla DPO.

I nuläget gör du det manuellt:

```bash
docker compose exec flexlab-db psql -U flexlab -c \
  "SELECT COUNT(*) FROM flexlab.results WHERE sampled_at > '2026-01-01';"
docker compose exec core-db psql -U core -c \
  "SELECT COUNT(*) FROM fhir_observations WHERE source_instance='flexlab' AND occurred_at > '2026-01-01';"
```

Sifforna ska matcha — annars: kolla Kafka consumer lag (Kafka UI), kolla transform‑loggar för `skipReason`.

---

## Steg 8 — Aktivera i produktion

Rulla ut i tre steg:

1. **Shadow mode** (1–2 veckor): connector kör, data flödar, men ingen konsument (dashboard, CDS) använder datan. Monitorera `core.system.quality.metrics`.
2. **Read‑only** (2–4 veckor): dashboard visar data, men CDS‑regler använder den inte för beslutsstöd än.
3. **Full activation**: CDS‑regler aktiveras för `patient-view` / `order-select`. Avregistrera äldre integrationer (punkt‑till‑punkt) om de ersätts.

**Checklista innan production‑on:**

- [ ] Debezium‑slot backup‑strategi dokumenterad (förlust = data‑gap).
- [ ] Audit‑retention konfigurerad (compact+delete 7 år).
- [ ] HSA‑ID och care‑unit validering mot Inera.
- [ ] Alert på `core.system.errors` > 10 / min.
- [ ] DR‑plan: hur återskapar du canonical store vid totalförlust? (svar: re‑play från Kafka.)

---

## Vanliga fällor

| Fälla | Lösning |
|---|---|
| Snapshot‑race: `observations` kommer före `patients` i Debezium's initial snapshot (alfabetisk ordning) → transform kan inte resolve:a `patient_ref`. | Pre‑populera patient‑cache **direkt från källdatabasen** vid transform‑startup (se `services/transform/src/patient-cache.ts`). |
| Decimal‑fält kommer som base64‑sträng från Debezium. | `decimal.handling.mode=double` i connector‑config. |
| Timestamps kommer som mikrosekund‑integer. | `time.precision.mode=connect` i connector‑config. |
| `encounter_id=1` i Melior **och** AsynjaVisph → ID‑kollision i canonical store. | Prefixa med `source_instance` (`melior-su-1` vs `asynja-1`). Redan gjort i `fhir_encounters.encounter_ref`. |
| FHIR‑materializer processar events out‑of‑order → senaste version överskrivs. | Använd event timestamp + version i `ON CONFLICT DO UPDATE WHERE incoming.ts > existing.ts`. |
| Connector restar utan `slot_name` → förlorar progress vid omstart. | Sätt `slot.name` explicit i connector‑config. |
| CDS‑regel hämtar data från FHIR Facade som saknas → timeout. | Returnera tom `cards`‑array, inte 500. Logga till `core.system.quality.metrics`. |

---

---

## Bilaga B — Lägga till ett nytt sjukhus som edge-nod

Utöver att ansluta nya källsystem kan Nimloth Core rullas ut som **edge-noder per sjukhus**. Varje edge-nod har lokal FHIR-replica + CDS + offline-tolerans. Exempel: rulla ut `edge-skas` (Skaraborgs Sjukhus).

### B.1 Förberedelse

Samma kodbas — ingen egen tjänst behöver skapas. Alla filer i `services/edge/` fungerar för valfri edge-nod via miljövariabler (`EDGE_INSTANCE_ID`, `EDGE_INSTANCE_NAME`, `EDGE_HOSPITAL_NAME`, `EDGE_HSA_ID`).

### B.2 Infrastruktur (docker-compose.distributed.yml)

Lägg till två nya services efter `edge-su`-blocken:

```yaml
services:
  # Lokal Kafka för SkaS
  edge-kafka-skas:
    image: confluentinc/cp-kafka:7.6.0
    container_name: edge-kafka-skas
    environment:
      KAFKA_NODE_ID: 1
      KAFKA_PROCESS_ROLES: broker,controller
      KAFKA_LISTENERS: PLAINTEXT://:29092,CONTROLLER://:9093
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://edge-kafka-skas:29092
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: PLAINTEXT:PLAINTEXT,CONTROLLER:PLAINTEXT
      KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER
      KAFKA_CONTROLLER_QUORUM_VOTERS: 1@edge-kafka-skas:9093
      KAFKA_INTER_BROKER_LISTENER_NAME: PLAINTEXT
      KAFKA_LOG_RETENTION_MS: "-1"
      CLUSTER_ID: "<22-char-base64url-uuid>"   # generera nytt med openssl rand -base64 16 | tr '+/' '-_' | tr -d '=' | head -c22
    volumes:
      - edge-skas-kafka-data:/var/lib/kafka/data
    profiles: ["edge-skas"]
    networks:
      - edge-skas-local

  # Edge runtime för SkaS
  edge-skas:
    build:
      context: .
      dockerfile: services/edge/Dockerfile
    container_name: edge-skas
    environment:
      EDGE_INSTANCE_ID: skas
      EDGE_INSTANCE_NAME: "Melior SkaS"
      EDGE_HOSPITAL_NAME: "Skaraborgs Sjukhus"
      EDGE_HSA_ID: "SE2321000131-E000000000002"
      LOCAL_KAFKA_BROKERS: edge-kafka-skas:29092
      CENTRAL_KAFKA_BROKERS: kafka:29092
      CENTRAL_FHIR_URL: http://fhir-facade:3003
      CENTRAL_HEALTH_URL: http://fhir-facade:3003/health
      EDGE_FHIR_PORT: "3003"
      EDGE_CDS_PORT: "3004"
      EDGE_STATUS_PORT: "3006"
    depends_on:
      edge-kafka-skas: { condition: service_healthy }
      kafka:          { condition: service_healthy }
      fhir-facade:    { condition: service_started }
    volumes:
      - edge-skas-data:/data
    ports:
      - "4103:3003"   # Obs: +100 offset från SU för att undvika kollision
      - "4104:3004"
      - "4106:3006"
    profiles: ["edge-skas"]
    networks:
      - edge-skas-local   # FÖRST — behåller host-port under nätavbrott
      - vgr

volumes:
  edge-skas-kafka-data:
  edge-skas-data:

networks:
  edge-skas-local:
    name: edge-skas-local
    driver: bridge
```

### B.3 Replikerings-tjänsten

Uppdatera `EDGE_INSTANCES` i `docker-compose.distributed.yml` → `replication`-servicen:

```yaml
environment:
  EDGE_INSTANCES: su,skas
```

Replication-tjänsten subscribar automatiskt både `edge-su.vgr.*` och `edge-skas.vgr.*` vid nästa restart och publicerar deras heartbeats på topologi-endpointen.

### B.4 Topologivy

Dashboardens `Topology.tsx` har en static positionsmap för sex pre-definierade edges (su, skas, nu, saes, kungalv, alingsas). `edge-skas` hamnar automatiskt på rätt plats i SVG-kartan. För nya instance_id:n utanför listan, lägg till koordinater i `EDGE_POSITIONS`-objektet.

### B.5 Separat Melior-instans (för realism)

I nuvarande PoC delar alla edges samma `melior-db`. För en realistisk edge per sjukhus ska varje edge ha sin egen Melior:

```yaml
melior-db-skas:
  image: postgres:16-alpine
  container_name: melior-db-skas
  command: ["postgres", "-c", "wal_level=logical", "-c", "max_wal_senders=10", "-c", "max_replication_slots=10"]
  environment:
    POSTGRES_DB: melior
    POSTGRES_USER: melior
    POSTGRES_PASSWORD: melior
  volumes:
    - melior-skas-data:/var/lib/postgresql/data
    - ./infra/postgres/init-melior.sql:/docker-entrypoint-initdb.d/init-melior.sql:ro
  profiles: ["edge-skas"]
  networks:
    - edge-skas-local   # lokalt sjukhusnätverk

volumes:
  melior-skas-data:
```

Sätt `instance_metadata.instance_id='skas'` i SQL:en så CDC-topics får rätt prefix.

### B.6 Starta den nya edge-noden

```bash
docker compose -f docker-compose.yml -f docker-compose.distributed.yml \
    --profile edge-su --profile edge-skas up -d
```

Verifiera:

```bash
curl -s http://localhost:4106/health    # edge-skas runtime
curl -s http://localhost:3007/topology  # ska nu visa 2 edges
```

### B.7 Checklista

- [ ] Nytt `CLUSTER_ID` (22-char base64url — återanvänd inte SU:s)
- [ ] `EDGE_HSA_ID` matchar sjukhusets HSA-katalog-id (Inera)
- [ ] Port-mappning offset (+100 per sjukhus) för att undvika host-kollision
- [ ] `edge-<id>-local`-nätverk listat **först** i `networks` för port-stabilitet
- [ ] `EDGE_INSTANCES` i replication-tjänsten inkluderar nya id:et
- [ ] Testat nätavbrotts-scenariot separat för den nya noden
- [ ] `instance_metadata`-seed i dess Melior-DB

---

## Referenser

- **Debezium PostgreSQL connector**: https://debezium.io/documentation/reference/stable/connectors/postgresql.html
- **Kafka Connect REST**: https://docs.confluent.io/platform/current/connect/references/restapi.html
- **FHIR R4 Resource Index**: https://hl7.org/fhir/R4/resourcelist.html
- **CDS Hooks spec**: https://cds-hooks.hl7.org/1.1/
- **SNOMED CT Sverige**: https://sct.socialstyrelsen.se/
- **LOINC Sverige**: https://loinc.org/international/sweden/
- **Interna:** [ARCHITECTURE.md](ARCHITECTURE.md) för lagerkontrakt, [DESIGN.md](DESIGN.md) för UI‑utvidgningar, [INSTALL.md](INSTALL.md) för deploy-specifika gotchas.
