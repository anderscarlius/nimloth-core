# WP-B72 — Inventering (docs/core + deploy)

Datum: **2026-10-01**. Söktermer: B72, B7, ghcr, from-scratch.

## Repo-dokument (nimloth-core)

| Referens | Innehåll relevant för B72 |
|----------|---------------------------|
| `CHANGELOG.md`, `docs/ROADMAP.md` | B7 nivå 1 levererad; nivå 2 (26 tjänster) obyggd |
| `docs/Runbook_Deploy.md` | Lokal dev, Moria ghcr-mönster (2 tjänster), cf4 co-location |
| `infra/openehr/DP-MF2-VERIFICATION.md` | “CI nivå 2” openEHR (ej samma som B7 — annan axel) |
| `deploy/demo-slice/INVENTORY.md` | Fas A slices; unified = `start.sh` |
| `deploy/core-slice/README.md` | Eldar 18124, Moria skiss, ingen SSH i CI |

## Extern (nimloth-docs — ej i checkout)

| Dokument | Roll |
|----------|------|
| `B7_CICD_och_Moria_2026-08-19.md` | B7 nivå 1 bevis, ghcr-tema |
| `CICD_Tema_ghcr_2026-08-19.md` | GHCR pull-deploy |
| `Malbild_Nimloth_Nordstjarna_v0.1.md` | B7 som bevislager |
| `Portstrategi.md` | 111xx / Eldar portar |
| Plan Bygg § C3 | WP-B72 acceptans |

## Befintliga “from scratch”-kedjor

| Kedja | Artefakt | Scenario |
|-------|----------|----------|
| **B72 minimal (unified)** | `from-scratch-local.sh` | Fru Andersson CDC → FHIR |
| **B7 nivå 1 (B4)** | `run-b4-chain-verification.sh` | Gateway + legacy-sim + EHRbase |
| **Eldar E8** | `deploy-ehrbase-eldar.sh` | Endast openEHR |
| **openEHR CI nivå 2** | `openehr-ci-level2.yml` | Compiler round-trip |

## WP-B72 nya artefakter

| Fil | Syfte |
|-----|--------|
| `SERVICE_LIST.md` | Avtalad minimal lista |
| `RUNBOOK.md` | Operatör lokal + Eldar |
| `from-scratch-local.sh` | Noll → healthy (lokal) |
| `smoke-b72-health.sh` | Spine health asserts |
| `../scripts/wp-b72-ci-facit.sh` | CI utan secrets |
| `spec/wp-b72-hel-stack-fran-noll.md` | Spec + acceptans |
