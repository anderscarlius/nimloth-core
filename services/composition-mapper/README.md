# composition-mapper

FHIR R4 `MedicationStatement` → openEHR `medication_summary.v1` composition-mappning
med två-lager-pipeline (deterministisk + LLM-assisterad) och human-review-pathway.

Sprint 2 / P4 (4.1-4.12) — levererad 2026-05-11. Demo-instans aktiv på
`http://192.168.1.189:11102` (CarliusFyra, synthetic-mode).

## Två-lager-pipeline

1. **Deterministisk mappning** (6 fält): direkta 1:1-relationer från FHIR-struktur
   till openEHR `medication_summary.v1`. `mapMedicationName`, `mapStatus`,
   `mapStartTime`, `mapRoute`, `mapSequence`, `mapSubject`. Returnerar
   `MappedField<T>` med `confidence: 1.0` eller `null`.

2. **LLM-assisterad mappning** (4 fält): tolkar fritext och tvetydiga värden.
   `parseDosageText`, `parseDosageTiming`, `inferStatus`, `suggestAtc`. Returnerar
   `LlmField<T>` med `confidence: 0..1` och `reasoning`. Routas via
   [`@nimloth-core/model-router`](../../packages/model-router/) baserat på
   sensitivity-tier.

3. **Aggregator** (`src/mapping/aggregator.ts`): kombinerar deterministisk + LLM
   per fält, beräknar aggregat-confidence (min-rule över alla LLM-fält), och
   utvärderar tre triggers för human-review:
   - `missing_required_field` — required-fält null efter båda pathways
   - `conflicting_evidence` — deterministisk ≠ LLM
   - `low_confidence` — aggregat < threshold (default 0.7)

Designdetaljer i [`docs/operations/Human_Review_Pathway_Design.md`](../../docs/operations/Human_Review_Pathway_Design.md).

## HTTP API

### `POST /api/v1/map/medication-statement`

Mappar en FHIR `MedicationStatement` till openEHR-composition + human-review-payload.

**Request body:**

```json
{
  "resource": {
    "resourceType": "MedicationStatement",
    "status": "active",
    "subject": { "reference": "Patient/test-001" },
    "medicationCodeableConcept": {
      "coding": [{
        "system": "http://www.whocc.no/atc",
        "code": "B01AA03",
        "display": "Waran"
      }]
    },
    "effectiveDateTime": "2026-05-01",
    "dosage": [{ "text": "1 tablett dagligen" }]
  },
  "inputId": "valfri-id-string",
  "options": {
    "useLlm": true,
    "threshold": 0.7
  }
}
```

`inputId` genereras automatiskt (UUID v4) om saknas. `options.useLlm: false`
skippar LLM-pathway helt (för felsökning eller deterministic-only-tester).
`options.threshold` overridar default 0.7.

**Response 200 (status: `complete`):**

```json
{
  "status": "complete",
  "composition": {
    "medicationName": { "value": { "name": "Waran", "code": "B01AA03", "system": "http://www.whocc.no/atc" } },
    "status": { "value": "active" },
    "startTime": { "value": "2026-05-01" },
    "subject": { "value": { "namespace": "patient", "type": "PERSON", "id": "test-001" } },
    "doseQuantity": { "value": { "value": 1, "unit": "tablet" } },
    "frequency": { "value": "DAILY" }
  },
  "reviewPayload": null,
  "fieldEvidence": [...],
  "aggregateConfidence": 0.9,
  "auditEvent": { /* MAPPING_COMPOSE-event */ }
}
```

**Response 200 (status: `human-review-required`):**

```json
{
  "status": "human-review-required",
  "composition": { /* partial composition */ },
  "reviewPayload": {
    "inputId": "...",
    "triggerReason": "low_confidence",
    "aggregateConfidence": 0.0,
    "fields": [ /* fieldEvidence-array med per-fält-detalj */ ],
    "proposedComposition": { /* same som composition ovan */ },
    "timestamp": "2026-05-11T15:00:00.000Z"
  },
  "fieldEvidence": [...],
  "aggregateConfidence": 0.0,
  "auditEvent": { /* MAPPING_REVIEW_REQUIRED-event */ }
}
```

**Response 400:** Zod-validation-fel på request body. Returnerar `details`-array
med specifika fel.

**Response 500:** Internt fel (LLM-routning, oväntad exception). Returnerar
`requestId` för logg-spårning.

### `GET /health`

```json
{
  "status": "ok",
  "service": "composition-mapper",
  "version": "0.1.0",
  "loadedAt": "2026-05-11T17:00:00.000Z",
  "dataMode": "synthetic",
  "audit": {
    "disabled": true,
    "connected": false,
    "publishedTotal": 0,
    "outbox": { "pending": 0, "published": 0, "failed": 0 }
  }
}
```

## Konfiguration

Environment-variabler (se [`.env.example`](../../.env.example) för fullständig
lista):

| Variabel | Krävs | Default | Beskrivning |
|---|:---:|---|---|
| `ANTHROPIC_API_KEY` | Ja (synthetic-mode) | — | Anthropic API-nyckel för cloud-routning |
| `NIMLOTH_DATA_MODE` | Nej | `phi` | `phi` (on-premise hard-rule) eller `synthetic` (cloud tillåten). B22.5. |
| `KAFKA_BROKERS` | Nej | `localhost:9092` | Broker-lista, eller `disabled` för demo-instans utan Kafka |
| `EHRBASE_URL` | Nej | (tom) | EHRbase-endpoint för AC6 (DEFERRED Väg 3c — ej använd) |
| `LOG_LEVEL` | Nej | `info` | pino log-level |
| `PORT` | Nej | `3001` | HTTP-port (mappas till 11102 i deploy) |
| `SQLITE_PATH` | Nej | `./data/composition-mapper.sqlite` | SQLite-fil för audit-outbox |
| `MODEL_ROUTING_CONFIG` | Nej | (auto-detect) | Path till model-routing.yaml — auto-detect via `/app/config` → monorepo-root |

## Sensitivity-routning (B22.5)

`mapMedicationStatement` skickar sensitivity-tag till model-router som styr
provider-val:

| `NIMLOTH_DATA_MODE` | Sensitivity i LLM-anrop | Tillåtna providers |
|---|---|---|
| `phi` (default) | `phi` | On-premise endast (hard rule i `residencyAllows()`) |
| `synthetic` | `synthetic` | On-premise + EU-cloud + US-cloud |

CarliusFyra:11102 är hard-låst till `synthetic` via env. Detaljer i
[`docs/operations/Demo_Mode_Configuration.md`](../../docs/operations/Demo_Mode_Configuration.md).

## Lokal utveckling

```bash
pnpm install
cp .env.example .env
# Sätt minst:
#   ANTHROPIC_API_KEY=sk-ant-...
#   NIMLOTH_DATA_MODE=synthetic
#   KAFKA_BROKERS=disabled
pnpm --filter @nimloth-core/composition-mapper dev
```

`/health` lyssnar på `http://localhost:3001/health`.

## Tester

```bash
# Alla unit + integration-tester
pnpm --filter @nimloth-core/composition-mapper test
# Resultat: 143/143 gröna (vid leverans 2026-05-11)

# Eval-set mot konfigurerad pathway (kostar Anthropic-tokens vid synthetic-mode)
pnpm --filter @nimloth-core/composition-mapper eval:all

# Bara deterministisk pathway (ingen LLM-cost)
pnpm --filter @nimloth-core/composition-mapper eval:deterministic
```

## Eval-set

50 manuellt skrivna FHIR → openEHR-par i [`eval-set/`](eval-set/). Fördelning:
12 simple / 23 moderate / 15 complex. Av dessa har 17 par `expected_review: true`
(designade för att utlösa review-pathway). Rapporter sparas i
`eval-set/reports/<timestamp>-<pathway>.json`.

**Slutmätningar P4 4.9 (Iteration 2, mot Anthropic claude-sonnet-4-6):**

| Metric | Värde | AC-krav | Status |
|---|---:|---:|:---:|
| Field-accuracy | 98.9% | ≥85% | ✅ |
| Review-recall | 64.7% | ≥95% | ⚠️ (B23 Sprint 3) |
| False-positive-review-rate | 3.0% | ≤10% | ✅ |
| Mean latency | 4545ms | n/a | — |

Per komplexitet (Iteration 2):
- simple (12 par): 99.0% accuracy
- moderate (23 par): 98.2% accuracy, 100% review-recall
- complex (15 par): 98.9% accuracy, 57.1% review-recall

Eval-historik och iteration-detaljer i
[`docs/operations/Human_Review_Pathway_Design.md`](../../docs/operations/Human_Review_Pathway_Design.md) §4.

## Deploy — CarliusFyra demo-instans

Permanent demo-instans på `192.168.1.189:11102`. Deploy via git-pull och
docker-compose.

```bash
ssh SkyttenAdmin@192.168.1.189
cd /volume2/docker/nimloth-core
git pull origin main

# Path-bound Synology docker-compose
/volume2/@appstore/ContainerManager/usr/bin/docker-compose \
  -f docker-compose.deploy.yml up -d --build composition-mapper

# Verifiera
curl -sf http://localhost:11102/health | jq '.dataMode'
```

Detaljerad runbook i [`docs/operations/Demo_Runbook.md`](../../docs/operations/Demo_Runbook.md).

## Arkitektoniska beslut

| ID | Beslut | Datum |
|---|---|---|
| Q-B (Val A) | LLM-routning default till on-premise; `phi` hard-låst | 2026-05-07 |
| 4.4 | `expected_fields` flat-format som eval-set-kanon | 2026-05-08 (B17.4) |
| AC6 | Live-EHRbase POST DEFERRED enligt Väg 3c | 2026-05-08 |
| B22.5 | `synthetic` sensitivity-tier för demo-routning till Anthropic | 2026-05-09 |
| B22.5.6 | Aggregator 3-case-distinktion för null-LLM-fält | 2026-05-10 |
| B25 4.10.5 | HTTP API-yta för demo-instans (POST /api/v1/map) | 2026-05-11 |

## Avvecklade / framtida

- **AC6** (live-EHRbase POST) — DEFERRED enligt Väg 3c, B22-kandidat post-P4
- **B23** — utvidgade review-triggers för structural ambiguity (Sprint 3)
- **B24** — on-premise LLM-pathway-aktivering när GPU-resurs är tillgänglig
- **B26** — docs-site-modernisering (port 11551)

## Referenser

- [`nimloth-docs/P4_Composition_Mapper.md`](../../nimloth-docs/P4_Composition_Mapper.md) — fullständig P4-spec (icke-versionerad)
- [`nimloth-docs/B22.5_Tier_Based_Sensitivity_Strategy.md`](../../nimloth-docs/B22.5_Tier_Based_Sensitivity_Strategy.md) — sensitivity-tier-strategi
- [`docs/operations/`](../../docs/operations/) — operations-dokumentation
- [`packages/model-router/src/router.ts`](../../packages/model-router/src/router.ts) — routing-algoritm + `residencyAllows()`
