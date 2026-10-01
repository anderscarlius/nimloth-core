# CompositionCommitted (WP-EVT1)

Efter varje lyckad `postComposition` emitterar composern **CompositionCommitted v1**
på Kafka-topic `core.domain.composition.committed`.

## Kod

- Publisher: `src/domain-events/publisher.ts`
- Triggers: `src/outbox/processor.ts`, `src/routes/event.ts`
- Schema och builder: `@nimloth-core/shared` (`composition-committed.schema.json`)

## Konfiguration

| Variabel | Default | Beskrivning |
|----------|---------|-------------|
| `DOMAIN_EVENTS_ENABLED` | `true` | `false` = ingen publicering |
| `DOMAIN_COMPOSITION_TOPIC` | `core.domain.composition.committed` | Topic |
| `KAFKA_BROKERS` | `kafka:29092` | Broker |
| `KAFKA_DOMAIN_CLIENT_ID` | `core-openehr-composer-domain` | Producer client id |

## Demo

Med unified stack (`./scripts/start.sh`) och domain-event-profil:

```bash
docker compose --profile domain-events up -d domain-event-audit-sink domain-event-lakehouse-stub
# Skicka kliniskt event (t.ex. deploy/demo-slice/publish-synthetic-vital.ts)
# Verifiera: curl localhost:3020/stats och localhost:3021/stats
```

Se `spec/wp-evt1-domain-event-contract.md` för full kontraktsbeskrivning.
