# Ingrid Andersson — Live-skiva seed-manifest

**Patient-id:** `ingrid-andersson-syn-001`
**Källa:** Exporterad från live EHRbase 192.168.1.189:11401 efter KU Steg 2b
**Datum:** 2026-06-01
**Filer:** 19 canonical openEHR JSON-kompositioner
**UID-strippade:** ja (genereras vid POST)

## Innehåll per template

| Template | Antal | Live-OMOP-projektion? |
|---|---:|---|
| `medication_summary.v1` | 5 | ✅ → `omop.drug_exposure` |
| `laboratory_test_result.v1` | 4 | ✅ → `omop.measurement` |
| `minimal_action.en.v1` | 5 | — klinisk kontext, ej i omop |
| `problem_diagnosis.v1` | 2 | (Del 2-scope för condition_occurrence) |
| `adverse_reaction_risk.v2` | 1 | (Del 3-scope) |
| `time_series.en.v1` | 1 | (vital_signs fixture, BP-mapping kräver SDG-10 Fas 2) |
| `minimal_evaluation.en.v1` | 1 | (vårdplan) |
| **Summa** | **19** | **9 hamnar i live-OMOP-skivan** |

## Filnamn-konvention

`<index>-<YYYY-MM-DD>-<template-utan-version-suffix>.json`

Index är POST-ordning (stigande start_time). Två filer med samma datum sorteras
sekundärt på composition-uid (deterministisk men inte kliniskt betydande).

## Idempotens-nyckel

`composer.name` är seed-skriptets idempotens-nyckel. Strängen följer mönstret:

```
<source_type> | <code> | <kort klinisk berättelse>
```

Exempel:
- `medication_statement | A10BA02 | Metformin 500 mg x 2 (T2D, sedan 2018)`
- `lab_result | EGFR | eGFR 42 mL/min/1.73m² (CKD stadium 3b)`
- `problem_diagnosis | I82.4 | Postoperativ djup ventrombos vänster ben`

Strängarna är unika över Ingrids 19 kompositioner (verifierat empiriskt). Två
seed-körningar med samma manifest ska därmed aldrig producera dubbletter —
seed-skriptet AQL:ar `c/composer/name = '<sträng>'` per fil och POST:ar bara
det som saknas.

## Klinisk berättelse i tidsordning

```
2024-11-15  Årlig diabetes-uppföljning (T2D)
              · Metformin, Simvastatin, Omeprazol bekräftade
              · HbA1c 54 (välbehandlad)
              · Penicillinallergi (J01CE) dokumenterad
              · Vital signs: BT 142/85
2025-02-20  Höft-koxartros M16.1 + remiss SU Mölndal
2025-03-15  Specialistkonsult: total höftprotes NFB49
              · eGFR 42 mL/min/1.73m² (CKD 3b — kontroll inför Waran)
2025-03-18  Postop DVT I82.4 → Warfarin (Waran) 2.5 mg insatt
2025-03-20  INR 2.8 (terapeutiskt)
2025-03-25  Vårdplan: Waran fortsätter minst 3 månader
2025-05-05  Ortoped-uppföljning: protes-status OK
2025-10-15  Årlig kontroll Närhälsan: HbA1c 52 (stabil)
2025-11-20  UVI: Amoxicillin 500 mg x 3 (J01CA04)
```

## Hur seed:as

```bash
# Idempotent reseed mot live EHRbase
EHRBASE_BASE_URL=http://192.168.1.189:11401/ehrbase \
pnpm --filter @nimloth-core/data-generator exec tsx src/scripts/seed-ingrid.ts
```

Två körningar i rad → identiska räkningar (no-op vid andra körningen).

Efter seed POST:ar skriptet automatiskt projektor:n för att fylla
`omop.drug_exposure` + `omop.measurement` med live_transform-lineage.
