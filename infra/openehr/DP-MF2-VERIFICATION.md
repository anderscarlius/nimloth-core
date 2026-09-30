# DP-MF2 — Verifikation av grön/röd beteende

Modellfabrikens **tekniska CI nivå 2**: EHRbase round-trip, AQL-smoke mot syntetisk
composition (dataclass 0), och path-diff mot committade baselines.

**Processgräns:** klinisk/semantisk granskning sker i
[Verkstaden](https://github.com/anderscarlius/vgr-datahubb-verkstad); detta workflow
validerar runtime-kontrakt mot EHRbase 2.30.1 i GitHub Actions.

**Out of scope här:** FHIR SUSHI/IG (MF3), Moria-deploy, produktions-CDR.

## Workflow

`.github/workflows/openehr-ci-level2.yml` — separat från MF1 (`openehr-ci-level1.yml`) så
ADL-only PR:er inte startar EHRbase-containers.

Återanvänder service-images och compile-steg från `openehr-compiler.yml`.

## Grön väg

| Steg | Vad som händer |
|------|----------------|
| `pnpm openehr:compile` | Minst `body_temperature.v2.p3_0b.opt` + `body_weight.v2.p3_0b.opt` genereras |
| POST template API | HTTP 201 eller idempotent 409 per template |
| GET template API | XML med openEHR-namespace + korrekt `template_id` |
| AQL | EHR + composition POST (`procedure.v1.p3_0b`, syntetisk ACTION) → query returnerar ≥1 rad |
| Path-diff | Alla rader i `path-baselines/*.paths.txt` finns i genererad OPT |

Tester: `test/openehr-mf2.test.ts`

## Röd väg — path-diff

Om en committad path saknas i ny OPT failar `OptPathInventoryCli --check` med lista på
saknade paths. Vitest inkluderar ett syntetiskt fail-case som lägger till en extra
baseline-rad som inte finns i OPT (regression guard).

## Acceptanskriterier

| ID | Status | Evidens |
|----|--------|---------|
| A1 | PR triggar MF2 vid openEHR/MF2/workflow-ändringar | `openehr-ci-level2.yml` `on.pull_request.paths` |
| A2 | ≥2 P3-OPT POST till EHRbase | `COMPILER_TEMPLATES` i `openehr-mf2.test.ts` |
| A3 | Round-trip GET med namespace + template_id | `round-trip` describe-block |
| A4 | AQL ≥1 rad syntetisk composition | `AQL smoke` describe-block |
| A5 | Path-baseline + fail vid borttagen path | `path-baselines/` + fail-case test |
| A6 | Docs processgräns MF2 vs Verkstaden | `infra/openehr/README.md` + denna fil |

## CI-länkar

Efter push: GitHub Actions → workflow **openEHR CI Nivå 2 — Modellfabriken (DP-MF2)** på PR.
