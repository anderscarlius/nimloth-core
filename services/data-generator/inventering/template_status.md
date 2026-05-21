# SDG-01 Template Status

Genererad: 2026-05-21T18:12:05.078Z
EHRbase: http://192.168.1.189:11401/ehrbase

## Sammanfattning

| Status | Antal |
|---|---:|
| LOADED | 0 |
| OPT_READY (kan laddas) | 1 |
| NEEDS_BUILD | 9 |

## Per template

| Template-ID | Status | OPT-fil | Lokala arketyper | Notat |
|---|---|---|---|---|
| `primary_care_encounter` | NEEDS_BUILD | — | openEHR-EHR-OBSERVATION.blood_pressure.v2.adl<br>openEHR-EHR-OBSERVATION.pulse.v2.adl | Arketyper finns lokalt men ingen OPT byggd. |
| `vital_signs` | NEEDS_BUILD | — | openEHR-EHR-OBSERVATION.blood_pressure.v2.adl<br>openEHR-EHR-OBSERVATION.body_temperature.v2.adl<br>openEHR-EHR-OBSERVATION.pulse.v2.adl | Arketyper finns lokalt men ingen OPT byggd. |
| `lab_order` | NEEDS_BUILD | — | — | Inga arketyper hittade lokalt – kräver CKM-hämtning. |
| `lab_result` | NEEDS_BUILD | — | — | Inga arketyper hittade lokalt – kräver CKM-hämtning. |
| `problem_diagnosis` | NEEDS_BUILD | — | openEHR-EHR-EVALUATION.problem_diagnosis.v1.adl | Arketyper finns lokalt men ingen OPT byggd. |
| `medication_statement` | OPT_READY | medication_summary.v1.opt.xml | openEHR-EHR-EVALUATION.medication_summary.v1.adl | OPT på disk: medication_summary.v1.opt.xml. (load FAIL: 406: ) |
| `referral` | NEEDS_BUILD | — | — | Inga arketyper hittade lokalt – kräver CKM-hämtning. |
| `specialist_consultation` | NEEDS_BUILD | — | — | Inga arketyper hittade lokalt – kräver CKM-hämtning. |
| `care_plan` | NEEDS_BUILD | — | — | Inga arketyper hittade lokalt – kräver CKM-hämtning. |
| `discharge_summary` | NEEDS_BUILD | — | — | Inga arketyper hittade lokalt – kräver CKM-hämtning. |

## Kritisk väg till SDG-02

SDG-02 kräver minst T02 (vital_signs) och T04 (lab_result) som LOADED.

Saknas: vital_signs, lab_result.

Nästa steg:
1. Hämta saknade ADL-arketyper från CKM (https://ckm.openehr.org).
2. Skapa OPT-templates (sammansatta) med relevanta arketyper.
3. Kör `pnpm openehr:compile` för att kompilera ADL→OPT.
4. Kör `pnpm openehr:load-templates` (eller `pnpm dev inventory` igen) för att ladda.
