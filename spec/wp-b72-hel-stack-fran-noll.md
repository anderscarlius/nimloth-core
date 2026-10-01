# WP-B72 — Hel stack från noll (Fas C3 / B7 nivå 2 minimal)

**Status:** implementerat (repo + CI-facit; ingen live Eldar-deploy).  
**Planreferens:** Plan Bygg § C3 / tidigare DP-B72.  
**Bygger på:** WP-DEMO1 (unified demo), E8 Eldar ehrbase `:18124`, B7 nivå 1 (B4 CI).

## Syfte

Nordstjärnan **B7 nivå 2** i roadmap betyder historiskt *hela 26-tjänstersstacken
rest från noll*. Det är **inte** byggt. WP-B72 levererar en **avtalad minimal
hel stack** som kan resas från noll med dokumenterad kommandokedja, GHCR-facit
där images finns, och Eldar som primärt målhost i runbook — utan implicit
Moria-expansion och utan live SSH från cloud agent.

## Nuläge (inventerat 2026-10-01)

| Källa | Vad som redan finns |
|-------|---------------------|
| `CHANGELOG.md` / `docs/ROADMAP.md` | B7 nivå 1 ✅ (B4-kedja CI); nivå 2 (26 tjänster) obyggd |
| `deploy/demo-slice/` | Unified lokal stack + AQL↔FHIR-bevis (WP-DEMO1) |
| `deploy/core-slice/` | Eldar ehrbase-only `:18124`, Moria fru-andersson-skiss |
| `services/migration-gateway/deploy/ci/` | B7 nivå 1 E2E + `verify-b4-chain-from-scratch` |
| GHCR publish | `fhir-facade`, `migration-gateway`, `cohort-service`, `smedjan-console` |
| `deploy/core-slice/docker-compose.moria.yml` | Aspirationella ghcr-taggar för ingest/transform/cds/audit |

## Mål (efter WP-B72)

1. **Tydlig tjänstelista** — minimal B7 nivå 2-spine (se `deploy/b72-slice/SERVICE_LIST.md`).
2. **Från noll → healthy** — `deploy/b72-slice/from-scratch-local.sh` + `RUNBOOK.md` (Eldar: ehrbase idag; full stack **kräver Anders-ja**).
3. **CI-facit utan hemligheter** — `scripts/wp-b72-ci-facit.sh` i `ci.yml` (compose config, bash -n, offline-smoke där möjligt).
4. **Acceptansmappning** — tabell nedan.

## Acceptans (mappning)

| Acceptans (C3) | Implementation |
|----------------|----------------|
| Avtalad tjänstelista | `deploy/b72-slice/SERVICE_LIST.md` — 16 tjänster spine + tier B/C |
| Från noll via ghcr (där möjligt) | GHCR-tabell + `docker compose config` med `.env.ci-facit` mot Moria-skiss |
| CI facit | `.github/workflows/ci.yml` → `wp-b72-ci-facit.sh`; B4: `migration-gateway-publish.yml` |
| Målhost Eldar i runbook | `deploy/b72-slice/RUNBOOK.md` § Eldar (`18124`, ingen live från agent) |
| Inte Moria-expansion | Runbook pekar på isolerade slices; legacy `/opt/nimloth-core` orörd |
| Inte live-deploy utan Anders-ja | Tydlig varning i runbook + README |

## Medvetet OUT

- Live SSH/deploy till Eldar/Moria från cloud agent
- Patientdata / prod-miljö
- Full 26-tjänstersstack (tier C i SERVICE_LIST — framtida B7 nivå 2 “full”)
- Iceberg/MinIO i default compose (P6 / WP-LH1 interim NDJSON)
- GHCR för ingest/transform/openehr-composer (inga publish-workflows än)

## Öppna frågor

- **Eldar unified overlay** — när ska Kafka+FHIR landa på Eldar (portplan utöver 18124)? Kräver operatörsbeslut.
- **GHCR för pipeline-tjänster** — Block 8-mönster för ingest/transform/composer återstår.

## Relaterat

- `deploy/b72-slice/RUNBOOK.md`
- `deploy/demo-slice/README.md`
- `deploy/core-slice/README.md`
- `nimloth-docs/B7_CICD_och_Moria_2026-08-19.md` (ej i denna checkout — extern sanningskälla)
