# WP-EVT1 — Domänhändelsekontrakt (Fas B3)

**Status:** implementerat i repo (CompositionCommitted v1).  
**Dataklass:** 0 (syntetisk demo-data).  
**Planreferens:** Smedjan Plan Bygg och Spec 2026-10-01, § B3.

## Syfte

När `openehr-composer` committar en composition till EHRbase ska en **versionerad
domänhändelse** publiceras så att nedströms konsumenter (audit, lakehouse, analys)
kan ansluta **oberoende** av varandra och utan omstart av producenten.

## Kontrakt

| Fält | Värde |
|------|--------|
| Logiskt namn | `CompositionCommitted` |
| Version | `1.0.0` (`event_version`) |
| Kafka-topic | `core.domain.composition.committed` |
| JSON Schema | `packages/shared/src/schemas/composition-committed.schema.json` |
| Builder | `buildCompositionCommittedEvent()` i `@nimloth-core/shared` |

### Payload (v1)

- `composition_uid`, `ehr_id`, `template_id`, `committed_at`
- `trigger_event_id`, `trigger_event_type` — lineage till inkommande kliniskt event
- `canonical_store`: `openehr`

Basfält enligt `base-event.schema.json` (`patient_id`, `source_system: core`, …).

## Producent

`services/openehr-composer` publicerar efter lyckad EHRbase-commit på:

- HTTP-vägen `POST /composer/event`
- Outbox-processorn (Kafka-inkommande events)

Miljövariabler:

- `DOMAIN_EVENTS_ENABLED` — default på (`false` stänger av)
- `DOMAIN_COMPOSITION_TOPIC` — default topic ovan
- `KAFKA_BROKERS` — samma broker som övriga core-tjänster

Publiceringsfel loggas; de **fäller inte** CDR-skrivningen (samma princip som bridge-audit).

## Konsumenter (referens)

| Tjänst | Consumer group | Roll |
|--------|----------------|------|
| `domain-event-audit-sink` | `domain-event-audit-sink` | Validerar schema, strukturerad audit-logg |
| `domain-event-lakehouse-stub` | `domain-event-lakehouse-stub` | Validerar schema, skriver NDJSON bronze-stub |

Start lokalt (efter Kafka + topics):

```bash
docker compose --profile domain-events up -d domain-event-audit-sink domain-event-lakehouse-stub
```

Nya konsumenter använder **egen group id** och kan starta när som helst mot samma topic.

## CI / kontraktsgrind

- `packages/shared` — schema positiv/negativ (fel `event_version` → fail)
- `domain-event-*-sink` — kontraktsgate-tester
- `.github/workflows/ci.yml` — kör WP-EVT1-pakettester

## Medvetet OUT (denna WP)

- Full Debezium-prod, Iceberg Bronze (→ LH1), Eldar/Moria live-deploy
- Patientdata i git
