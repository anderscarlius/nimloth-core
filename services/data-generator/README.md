# @nimloth-core/data-generator

Syntetisk patientdatagenerator för Nimloth EHRbase-population.

Implementerar SDG-01..SDG-08 från Nimloth_SDG_Specifikationsserie_v1.0, utökad med
SDG-09 (namngivna ankarpersoner) och SDG-10/Fas 1 (migrering till äkta domän-OPTs:
laboratory_test_result.v1, medication_summary.v1, problem_diagnosis.v1,
adverse_reaction_risk.v2 — fixture-shapes ersatta). Se `memory/` för SDG-10-
amendments + öppna spår (terminologibindning, profil-tagg→ICD-normalisering).

## Översikt

- **profiles/** — kliniska vårdprofiler (YAML), SDG-03
- **pathways/** — state machines per profil (YAML), SDG-04
- **src/composers/** — FLAT JSON-byggare per template, SDG-05
- **src/engine/** — PathwayEngine + ClinicalSampler + TimelineGenerator, SDG-04
- **src/loader/** — EhrCreator + CompositionDispatcher + LoadPipeline + RoundTripVerifier, SDG-06
- **src/queries/** — AQL demo, SDG-08
- **inventering/** — template_status.md (SDG-01-output)
- **fas0/** — round-trip-rapport (SDG-02-output)
- **data/** — population_manifest.json + population_report.md (SDG-07-output)
- **queries/** — aql_demo_queries.md + query_results.json (SDG-08-output)

## EHRbase

Lokal/dev: http://192.168.1.189:11401/ehrbase (CarliusFyra, openEHR REST API v1, ADL 1.4).
Konfigureras via env `EHRBASE_BASE_URL`.

## Kommandon

```bash
pnpm openehr:list-templates              # SDG-01
pnpm validate:profiles                   # SDG-03
pnpm test:engine                         # SDG-04
pnpm test:composers                      # SDG-05
pnpm test:composers:integration          # SDG-05 mot EHRbase
pnpm generate:load --profile <id> --count <N> [--dry-run] [--seed <N>]  # SDG-06/07
pnpm demo:aql [--id AQL-XX | --category A|B|C]  # SDG-08
```
