# SDG-02 — Ingrid Svensson round-trip-rapport

Genererad: 2026-05-26T19:52:16.946Z
EHRbase: http://192.168.1.189:11401/ehrbase
Patient subject_id: `ingrid-svensson-syn-001`
ehr_id: `80350b69-e864-43cb-98a3-5573d789529c`

## Resultat

10/10 compositions postade utan fel.

| ID | Dag | Event-typ | Template | Status | composition_uid |
|---|---:|---|---|---|---|
| C01 | 0 | primary_care_encounter | minimal_action.en.v1 | OK | `d1c9dcf2-db1f-4b2c-8db3-477d485dd33e` |
| C02 | 0 | vital_signs | time_series.en.v1 | OK | `9b5990e3-f49f-4169-8a00-c745107a1e3f` |
| C03 | 0 | lab_order | minimal_action.en.v1 | OK | `e7eaedb9-5d89-43cc-be9a-8bf6c4e554c4` |
| C04 | 1 | lab_result | time_series.en.v1 | OK | `53e6c773-6233-4baa-ace8-f6aa15fd9b68` |
| C05 | 3 | problem_diagnosis | minimal_evaluation.en.v1 | OK | `5363db3f-a771-4c82-a49a-8b4c84754224` |
| C06 | 3 | medication_statement | minimal_evaluation.en.v1 | OK | `bb11d797-70fd-47cb-996c-deef6e242b13` |
| C07 | 3 | referral | minimal_action.en.v1 | OK | `09222166-8c5c-4c2e-b9a0-82a323b48131` |
| C08 | 48 | specialist_consultation | minimal_action.en.v1 | OK | `e5ea5442-f8c8-432a-bed6-59757b6c7f39` |
| C09 | 95 | lab_result | time_series.en.v1 | OK | `4b0bd438-1497-4d97-a32c-03d701141b82` |
| C10 | 95 | care_plan | minimal_evaluation.en.v1 | OK | `b48f021b-3e0b-4fd4-8ec7-e86a33156977` |

## AQL-verifiering

```sql
-- countAll
SELECT COUNT(c) FROM EHR e CONTAINS COMPOSITION c WHERE e/ehr_id/value = '80350b69-e864-43cb-98a3-5573d789529c';

-- compositions
SELECT c/uid/value, c/composer/name, c/context/start_time/value FROM EHR e CONTAINS COMPOSITION c WHERE e/ehr_id/value = '80350b69-e864-43cb-98a3-5573d789529c' ORDER BY c/context/start_time/value;

-- hba1cs
SELECT c/composer/name, c/context/start_time/value FROM EHR e CONTAINS COMPOSITION c WHERE e/ehr_id/value = '80350b69-e864-43cb-98a3-5573d789529c' AND c/composer/name LIKE '*HbA1c*' ORDER BY c/context/start_time/value;

-- diagnoses
SELECT c/composer/name FROM EHR e CONTAINS COMPOSITION c WHERE e/ehr_id/value = '80350b69-e864-43cb-98a3-5573d789529c' AND c/composer/name LIKE '*problem_diagnosis*';
```

### Resultat (rader)

- **countAll**: 1 rader
- **compositions**: 10 rader
- **hba1cs**: 3 rader
- **diagnoses**: 1 rader

## Anteckning om scope

Compositions skrivs mot tre fixture-shapes (time_series, minimal_action, minimal_evaluation) eftersom
domänspecifika OPT:er ännu inte finns (P3.0b ADL→OPT-compiler är öppet arbete). Kliniska detaljer
(diagnoskoder, läkemedelsnamn) bärs i `composer.name` enligt mönstret
`"TYPE | CODE | DESCRIPTION"` så AQL CONTAINS-frågor kan filtrera per event-typ och kod.
