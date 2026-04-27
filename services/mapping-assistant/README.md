# mapping-assistant

AI-assisterad mapping-utvecklare för Nimloth Core. Föreslår TypeScript-mappers från databas-schema, observerar kvalitetsmetrics, frågar vid låg confidence — och **publicerar aldrig direkt**. Alla förslag granskas och godkänns manuellt.

Sprint 2 (P4) — Fas 4.1: skelett, /propose, audit-publisher, signed prompts. Fas 4.2 lägger /observe och /ask. Fas 4.3 dashboard-vy.

## Endpoints (Fas 4.1)

| Method | Path | Beskrivning |
|---|---|---|
| GET | `/health` | Liveness |
| GET | `/system-status` | Router-providers + outbox-status + verifierade prompts |
| POST | `/propose` | Skapa nytt förslag från schema + target |
| GET | `/suggestions?status=pending` | Lista förslag |
| GET | `/suggestions/:id` | Hämta enskilt förslag |
| POST | `/suggestions/:id/approve` | Godkänn (kräver approver_hsa_id + approver_role) |
| POST | `/suggestions/:id/reject` | Avvisa |

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
| `KAFKA_BROKERS` | `kafka:29092` | Kafka brokers |
| `REQUIRE_VALID_PROMPTS` | `true` | Vägra starta vid manifest-mismatch |
| `ANTHROPIC_API_KEY` | — | Aktiverar Anthropic-providern. Saknas → mock-fallback |

## Utveckling

```bash
pnpm --filter @nimloth-core/mapping-assistant build
pnpm --filter @nimloth-core/mapping-assistant test
pnpm --filter @nimloth-core/mapping-assistant dev
```

Smoke-test mot mock-providern:

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
