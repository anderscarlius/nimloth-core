# SDG-02 — Ingrid Svensson round-trip-rapport

Genererad: 2026-05-21T18:38:13.658Z
EHRbase: http://192.168.1.189:11401/ehrbase
Patient subject_id: `ingrid-svensson-syn-001`
ehr_id: `cdc026d9-3ff2-496d-a8bd-e1ef3bd661d1`

## Resultat

10/10 compositions postade utan fel.

| ID | Dag | Event-typ | Template | Status | composition_uid |
|---|---:|---|---|---|---|
| C01 | 0 | primary_care_encounter | minimal_action.en.v1 | OK | `47133e51-a398-4765-b5bf-cc94e088c0aa` |
| C02 | 0 | vital_signs | time_series.en.v1 | OK | `74b1c51a-b275-4c9d-87b9-ef0d88caaeba` |
| C03 | 0 | lab_order | minimal_action.en.v1 | OK | `2fff98ba-88d6-4b44-bb5f-a485fe8b2a2e` |
| C04 | 1 | lab_result | time_series.en.v1 | OK | `66f86afa-2dc1-4aee-8991-d7c4001ed5b6` |
| C05 | 3 | problem_diagnosis | minimal_evaluation.en.v1 | OK | `c678cbd3-325d-409a-be28-d137a6f120c6` |
| C06 | 3 | medication_statement | minimal_evaluation.en.v1 | OK | `2c4ee4c1-2d5d-4247-bee5-142e063812a5` |
| C07 | 3 | referral | minimal_action.en.v1 | OK | `7035ad70-60b5-4b52-9a5c-d426f5621252` |
| C08 | 48 | specialist_consultation | minimal_action.en.v1 | OK | `a27e995d-c8fa-43df-b656-e05f929a7d88` |
| C09 | 95 | lab_result | time_series.en.v1 | OK | `c639242f-1b9b-444b-b5b8-57d465a68531` |
| C10 | 95 | care_plan | minimal_evaluation.en.v1 | OK | `b9d21efc-7ffd-4819-9ffe-841627bf58a4` |

## AQL-verifiering

```sql
-- countAll
SELECT COUNT(c) FROM EHR e CONTAINS COMPOSITION c WHERE e/ehr_id/value = 'cdc026d9-3ff2-496d-a8bd-e1ef3bd661d1';

-- compositions
SELECT c/uid/value, c/composer/name, c/context/start_time/value FROM EHR e CONTAINS COMPOSITION c WHERE e/ehr_id/value = 'cdc026d9-3ff2-496d-a8bd-e1ef3bd661d1' ORDER BY c/context/start_time/value;

-- hba1cs
SELECT c/composer/name, c/context/start_time/value FROM EHR e CONTAINS COMPOSITION c WHERE e/ehr_id/value = 'cdc026d9-3ff2-496d-a8bd-e1ef3bd661d1' AND c/composer/name LIKE '*HbA1c*' ORDER BY c/context/start_time/value;

-- diagnoses
SELECT c/composer/name FROM EHR e CONTAINS COMPOSITION c WHERE e/ehr_id/value = 'cdc026d9-3ff2-496d-a8bd-e1ef3bd661d1' AND c/composer/name LIKE '*problem_diagnosis*';
```

### Resultat (rader)

- **countAll**: 1 rader
- **compositions**: 33 rader
- **hba1cs**: 9 rader
- **diagnoses**: 3 rader

## Anteckning om scope

Compositions skrivs mot tre fixture-shapes (time_series, minimal_action, minimal_evaluation) eftersom
domänspecifika OPT:er ännu inte finns (P3.0b ADL→OPT-compiler är öppet arbete). Kliniska detaljer
(diagnoskoder, läkemedelsnamn) bärs i `composer.name` enligt mönstret
`"TYPE | CODE | DESCRIPTION"` så AQL CONTAINS-frågor kan filtrera per event-typ och kod.
