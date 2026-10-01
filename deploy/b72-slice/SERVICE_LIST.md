# B7 nivå 2 — avtalad minimal tjänstelista (WP-B72)

**Datum:** 2026-10-01  
**Scope:** Minimal *hel stack* som bevisar klinisk dataväg från noll — **inte**
root `docker-compose.yml` alla ~26 tjänster (tier C).

Legend: **build** = `docker compose up --build` från repo; **ghcr** = publicerad
image (workflow i `.github/workflows/*-publish.yml`); **hub** = publik upstream-image.

## Tier A — B72 spine (krävs för “healthy”)

| # | Compose-tjänst | Roll | Image-källa |
|---|----------------|------|-------------|
| 1 | `melior-db` | Käll-DB (CDC) | hub |
| 2 | `asynja-db` | Käll-DB (CDC) | hub |
| 3 | `core-db` | FHIR/materializer-lager | hub |
| 4 | `kafka` | Event-bus | hub |
| 5 | `schema-registry` | Kafka-schema | hub |
| 6 | `kafka-connect` | Debezium | hub |
| 7 | `ehrbase-db` | openEHR-lagring | hub (ehrbase-v2-postgres) |
| 8 | `ehrbase` | CDR REST/AQL | hub |
| 9 | `ingest` | Connector-orkestrering | **build** (ghcr aspirationell) |
| 10 | `transform` | Melior/Asynja → Kafka kliniska topics | **build** |
| 11 | `openehr-composer` | Composition + domain events | **build** |
| 12 | `fhir-facade` | FHIR R4 + materializer | **build** lokalt; **ghcr** på host-deploy |
| 13 | `keycloak` | Auth stub (`AUTH_MODE=dev` kan kringgå PDL i demo) | hub |

**Healthy-bevis (Tier A):** `smoke-b72-health.sh` — EHRbase, ≥1 Debezium-connector,
topic `core.clinical.observation.vitals`, FHIR `/health`.

## Tier B — rekommenderad för CIO/demo (WP-DEMO1)

| # | Tjänst | Roll | Image |
|---|--------|------|-------|
| 14 | `dashboard` | UI | build |
| 15 | `domain-event-audit-sink` | Kontraktsgate domain events | build (`--profile domain-events`) |
| 16 | `domain-event-lakehouse-stub` | Bronze/silver interim (LH1) | build (`--profile domain-events`) |

**Extra bevis:** `deploy/demo-slice/run-aql-fhir-vitals-proof.sh` (syntetisk vital).

## Tier C — full huvudstack (B7 nivå 2 “26 tjänster”, **OUT för WP-B72**)

Övriga tjänster i root compose som **inte** ingår i B72-minimal:

`cds-hooks`, `audit`, `terminology`, `mapping-assistant`, `snowstorm`,
`hapi-fhir-terminology`, `hsa`, `kafka-test-producer`, `dashboard-demo`,
`aql-template-service`, `med-review`, `replication`, `edge`, …

Dessa kan startas via `./scripts/start.sh` men är inte krav för B72-acceptans.

## GHCR — faktisk status (2026-10-01)

| Image | Workflow | Används i B72 |
|-------|----------|---------------|
| `nimloth-core-fhir-facade` | `fhir-facade-publish.yml` | Host-slice / facit-config |
| `nimloth-core-migration-gateway` | `migration-gateway-publish.yml` | **Separat** B7 nivå 1 (B4), inte Fru Andersson-spine |
| `nimloth-core-cohort-service` | `cohort-service-publish.yml` | Ej i Tier A |
| `nimloth-core-smedjan-console` | `smedjan-console-publish.yml` | Ej i Tier A |
| `nimloth-legacy-sim` | (legacy-sim repo/image) | B4 CI only |
| `nimloth-core-ingest` etc. | *saknas* | Aspiration i `docker-compose.moria.yml` |

## Eldar (primärt målhost)

| Fas | Tjänster | Port |
|-----|----------|------|
| **E8 (idag)** | `ehrbase-db`, `ehrbase` | **18124** |
| **Framtida unified** | Tier A+B på Eldar | *kräver Anders-ja + portplan* |

Se `deploy/core-slice/deploy-ehrbase-eldar.sh` och `RUNBOOK.md`.

## Moria

**Inte** implicit expansion. Isolerade slices (`deploy/core-slice/`) och B4
gateway-deploy dokumenteras separat; fryst `/opt/nimloth-core` är inte sanning.
