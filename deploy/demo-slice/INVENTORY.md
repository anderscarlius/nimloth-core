# Fas A — Inventering befintliga demo-/deploy-slices

Datum: **2026-10-01** (WP-DEMO1). Syfte: välja **återanvändning** framför ny monolit.

## 1. Lokal full stack (unified B1-referens)

| Artefakt | Innehåll |
|----------|----------|
| `docker-compose.yml` (+ valfri `override`) | EHRbase, Kafka, Debezium, ingest/transform, openehr-composer, fhir-facade (`CANONICAL_STORE=both`), dashboard, Keycloak stub |
| `./scripts/start.sh` | Orkestrerar infra → topics → connectors → seed → templates → app-tjänster |
| `./scripts/demo-fru-andersson.sh` | FHIR/CDS/audit/mapping HTTP-demo |
| `docs/QUICKDEMO.md` | 3/10/20-min scenarier |

**Event-path:** Melior/Asynja Postgres → Debezium → Kafka → transform →
`core.clinical.*` → fhir-facade materializer + openehr-composer.

**Utgående CDR-domän (WP-EVT1):** efter composition-commit →
`core.domain.composition.committed` (CompositionCommitted v1) →
`domain-event-audit-sink` + `domain-event-lakehouse-stub` (profil `domain-events`).

## 2. Moria — fru-andersson-slice (skiss, GHCR)

| Artefakt | Innehåll |
|----------|----------|
| `deploy/core-slice/docker-compose.moria.yml` | Kafka + CDC + fhir-facade (postgres-only canonical) |
| `deploy/core-slice/docker-compose.ehrbase-slice.yml` | Overlay: EHRbase **:11124**, composer (aspirationell image) |
| `deploy/core-slice/deploy.sh` | pull/up scopat infra vs fhir-facade |

**Status:** skiss — inte unified demo; kräver landade init-SQL på host (G4).

## 3. Eldar — ehrbase-only (PR #18 / core-slice)

| Artefakt | Innehåll |
|----------|----------|
| `deploy/core-slice/docker-compose.ehrbase-only.yml` | Bara EHRbase + DB |
| `deploy/core-slice/docker-compose.eldar.yml` | Host **18124** |
| `deploy-ehrbase-eldar.sh`, `smoke-ehrbase-eldar.sh` | Operatör runbook (ingen CI-SSH) |

**Status:** openEHR-lager isolerat; **ingen** Kafka/FHIR i samma slice än.

## 4. B4-kedja (migration-gateway)

| Artefakt | Innehåll |
|----------|----------|
| `services/migration-gateway/deploy/ci/docker-compose.ci.yml` | EHRbase :11401, gateway :11113, legacy-sim |
| `run-b4-chain-verification.sh` | E2E med paritetsdiff (anteckning) |
| `.github/workflows/migration-gateway-publish.yml` | Job `verify-b4-chain-from-scratch` |

**Event-path:** annat scenario (strangler gateway), **inte** Fru Andersson CDC.
Används som **CI-bevis** att EHRbase + event-logik kan resas från noll.

## 5. FHIR-fasad publish

| Artefakt | Innehåll |
|----------|----------|
| `.github/workflows/fhir-facade-publish.yml` | GHCR-image för slice-deploy |

## B1-beslut

**Unified demo-path (B):** dokumenterad kedja = `./scripts/start.sh` (lokal) med
bevis i `deploy/demo-slice/run-*.sh`. **Eldar** får portnot (**18124**) och pekar
på framtida overlay — full unified på Eldar är **inte** scope i denna PR.

## 6. WP-B72 (C3 — B7 nivå 2 minimal)

| Artefakt | Innehåll |
|----------|----------|
| `deploy/b72-slice/SERVICE_LIST.md` | Tier A spine (16 tjänster) vs full 26-stack OUT |
| `deploy/b72-slice/from-scratch-local.sh` | Noll → healthy (återanvänder `start.sh` + health) |
| `scripts/wp-b72-ci-facit.sh` | compose config + bash -n utan secrets |
| `spec/wp-b72-hel-stack-fran-noll.md` | Acceptansmappning Plan Bygg § C3 |
