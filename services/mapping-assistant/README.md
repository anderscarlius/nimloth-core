# mapping-assistant

AI-assisterad mapping-utvecklare för Nimloth Core. Föreslår TypeScript-mappers från databas-schema, observerar kvalitetsmetrics, frågar vid låg confidence — och **publicerar aldrig direkt**. Alla förslag granskas och godkänns manuellt.

Sprint 2 (P4) — Fas 4.1: skelett, /propose, audit-publisher, signed prompts. Fas 4.2: Observer (Kafka-konsument på `core.system.quality.metrics` med 24h-aggregator), Asker (Kafka-konsument på `core.system.mapping.pending` för låg-confidence-events från transform), policies, CLI `pnpm mapper:propose`. Fas 4.3 lägger dashboard-vy.

## Tre flöden

| Flöde | Trigger | Sensitivity | Provider-default |
|---|---|---|---|
| **Propose** | Manuell (CLI eller HTTP) — "föreslå mapper för denna nya tabell" | schema-only | Anthropic Cloud |
| **Observe** | Auto — aggregat på skip-events från transform passerar tröskel (default 10/24h) | schema-only | Anthropic Cloud |
| **Ask** | Auto — transform publicerar `mapping.pending` när mapper rapporterar `confidence: 'low'` | **phi → on-premise required** | Ollama (lokal) |

## Endpoints

| Method | Path | Beskrivning |
|---|---|---|
| GET | `/health` | Liveness |
| GET | `/system-status` | Router-providers + outbox + observer/asker-status + verifierade prompts |
| POST | `/propose` | Skapa nytt förslag från schema + target |
| GET | `/suggestions?status=pending` | Lista förslag |
| GET | `/suggestions/:id` | Hämta enskilt förslag |
| POST | `/suggestions/:id/approve` | Godkänn (kräver approver_hsa_id + approver_role) |
| POST | `/suggestions/:id/reject` | Avvisa |
| POST | `/observer/skip` | Direkt-injicera skip-event (för demo/test/dashboard) |
| POST | `/observer/evaluate` | Tvinga aggregat-utvärdering nu (annars timer-styrt) |
| POST | `/asker/pending` | Direkt-injicera mapping.pending-event |
| POST | `/asker/tick` | Tvinga asker-poll nu |

## Säkerhet

- **Skriver bara till `proposed/`-mappen** — manuell flytt enda vägen till produktion.
- **Signed prompt-manifest** — service vägrar starta om prompts har manipulerats. Se `prompts/manifest.json` och [docs/architecture/prompt-signing.md](../../docs/architecture/prompt-signing.md).
- **Sensitivity-aware routing** — `mapping.ask` (PHI) tvingas till on-premise via model-router. Se [docs/architecture/model-routing.md](../../docs/architecture/model-routing.md).

## Distribuerad drift

Tjänsten är portabel:

- SQLite för lokal state (`/data/mapping-assistant.db`).
- Kafka är optional — audit-events bufras i outbox när broker är nere och drainas när uppe.
- Anthropic API-key valfri — saknas key används mock-providern.

## Konfiguration

| Env | Default | Beskrivning |
|---|---|---|
| `MAPPING_ASSISTANT_PORT` | `3009` | HTTP-port |
| `MAPPING_ASSISTANT_DB` | `/data/mapping-assistant.db` | SQLite-fil |
| `MODEL_ROUTING_CONFIG` | `/app/config/model-routing.yaml` | YAML-config för model-router |
| `MAPPING_AUDIT_TOPIC` | `core.audit.mapping` | Kafka-topic för audit |
| `QUALITY_METRICS_TOPIC` | `core.system.quality.metrics` | Observer-input |
| `MAPPING_PENDING_TOPIC` | `core.system.mapping.pending` | Asker-input |
| `KAFKA_BROKERS` | `kafka:29092` | Kafka brokers |
| `OBSERVER_ENABLED` | `true` | Aktivera observer-flödet |
| `OBSERVER_THRESHOLD` | `10` | Antal events innan suggestion triggas |
| `OBSERVER_WINDOW_SECONDS` | `86400` | Aggregat-fönster (24h) |
| `OBSERVER_EVALUATE_INTERVAL_MS` | `60000` | Hur ofta aggregat utvärderas |
| `ASKER_ENABLED` | `true` | Aktivera asker-flödet |
| `ASKER_POLL_INTERVAL_MS` | `15000` | Hur ofta pending-jobb processas |
| `REQUIRE_VALID_PROMPTS` | `true` | Vägra starta vid manifest-mismatch |
| `ANTHROPIC_API_KEY` | — | Aktiverar Anthropic-providern. Saknas → mock-fallback |

## Utveckling

```bash
pnpm --filter @nimloth-core/mapping-assistant build
pnpm --filter @nimloth-core/mapping-assistant test
pnpm --filter @nimloth-core/mapping-assistant dev
```

Smoke-test mot mock-providern via CLI:

```bash
pnpm mapper:propose \
  --source flexlab.results \
  --target core.clinical.lab.result \
  --schema '[{"column":"patient_id","type":"integer"},{"column":"order_type","type":"text"},{"column":"result_value","type":"numeric"}]' \
  --samples '[{"patient_id":1,"order_type":"STD","result_value":42}]'
```

Eller direkt mot HTTP:

```bash
curl -X POST http://localhost:3009/propose \
  -H "Content-Type: application/json" \
  -d '{
    "source": "flexlab.results",
    "target": "core.clinical.lab.result",
    "schema": [
      {"column": "patient_id", "type": "integer"},
      {"column": "order_type", "type": "text"},
      {"column": "result_value", "type": "numeric"}
    ],
    "samples": [{"patient_id": 1, "order_type": "STD", "result_value": 42}]
  }'
```

Trigga observer manuellt:

```bash
# Skicka in 10 skip-events och tvinga utvärdering
for i in $(seq 1 10); do
  curl -s -X POST http://localhost:3009/observer/skip \
    -H "Content-Type: application/json" \
    -d '{"type":"skip","source_system":"flexlab","source_table":"results","column_name":"order_type","reason":"unknown_enum_value","sample_value":"URGENT_HOME"}'
done
curl -s -X POST http://localhost:3009/observer/evaluate
curl -s 'http://localhost:3009/suggestions?status=pending'
```
