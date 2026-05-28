# SDG-08 — AQL-demofrågor

Genererad: 2026-05-28T12:24:56.688Z
EHRbase: http://192.168.1.189:11401/ehrbase

## Sammanfattning

| ID | Tier | Titel | Resultat | Tid (ms) |
|---|---|---|---:|---:|
| AQL-01 | honest | Patienter med diagnos diabetes mellitus typ 2 (E11) | 162 | 303 |
| AQL-02 | honest | Patienter med HbA1c > 70 (senaste värdet) | 32 | 635 |
| AQL-03 | proxy | Patienter med systoliskt BT > 160 (senaste mätning) | 106 | 310 |
| AQL-04 | honest | Patienter med ≥ 5 medication_statement-events (polyfarmaci) | 145 | 229 |
| AQL-05 | proxy | Patienter med remiss (referral-event) | 183 | 156 |
| AQL-06 | honest | Diabetespatienter (E11) utan uppföljande HbA1c | 11 | 861 |
| AQL-07 | honest | HbA1c-trend per patient (första vs senaste värde) | 103 | 375 |
| AQL-08 | proxy | Median dagar från första kontakt till remiss (per profil) | 11 | 242 |
| AQL-09 | proxy | Patienter med > 3 primary_care_encounter under 90 dagar | 11 | 188 |
| AQL-10 | honest | Patienter med förbättrade labbvärden efter läkemedelsinsättning | 36 | 734 |
| AQL-11 | honest | Äldre multisjuka patienter (≥3 ICD-diagnoser + polyfarmaci) | 107 | 345 |
| AQL-12 | proxy | Marianne Lindqvists fullständiga journal kronologiskt | 22 | 245 |
| AQL-13 | honest | Patienter med >= 7 medication_statement (proxy för läkemedelsinteraktionsrisk) | 101 | 133 |
| AQL-14 | honest | Patienter vars labbvärden FÖRSÄMRATS trots läkemedelsinsättning | 7 | 682 |
| AQL-15 | honest | Median-magnitude per labbtyp (proxy för populationsstatistik) | 9 | 250 |

## Frågor i detalj

### AQL-01 — Patienter med diagnos diabetes mellitus typ 2 (E11)

**Kategori:** A

**Beskrivning:** Patienter med problem_diagnosis-composition vars diagnos_code = E11 (äkta ICD-10, normaliserad i Fas 3 — ingen profil-tagg). Fångar både diabetes_typ2-profilen och aldre_multisjuk-metformin-bärare.

```aql
SELECT DISTINCT e/ehr_id/value
FROM EHR e
CONTAINS COMPOSITION c
CONTAINS EVALUATION v[openEHR-EHR-EVALUATION.problem_diagnosis.v1]
WHERE v/data[at0001]/items[at0003]/value/defining_code/code_string = 'E11'
```

**Resultat:** 162 rader (162 råa), 303 ms

Första 3 träffarna:

```json
[
  [
    "01036ada-e442-48fc-b4b7-41b911a0da13"
  ],
  [
    "061c9627-9450-4e32-9b86-9a35c9e2167a"
  ],
  [
    "07d9769f-d94b-4caf-b714-2e6af9fa898a"
  ]
]
```

### AQL-02 — Patienter med HbA1c > 70 (senaste värdet)

**Kategori:** A

**Beskrivning:** lab_result-compositions med analyte_name='HBA1C' och magnitude över parametriserad tröskel (server-side filter, Fas 2-liftbar). Senaste värde per patient client-side.

```aql
SELECT e/ehr_id/value, o/data[at0001]/events[at0002]/data[at0003]/items[at0006]/value/magnitude, o/data[at0001]/events[at0002]/data[at0003]/items[at0006]/value/units, c/context/start_time/value
FROM EHR e
CONTAINS COMPOSITION c
CONTAINS OBSERVATION o[openEHR-EHR-OBSERVATION.laboratory_test_result.v1]
WHERE o/data[at0001]/events[at0002]/data[at0003]/items[at0004]/value/value = 'HBA1C'
AND o/data[at0001]/events[at0002]/data[at0003]/items[at0006]/value/magnitude > :hba1c_threshold
ORDER BY c/context/start_time/value DESC
```

**Resultat:** 32 rader (62 råa), 635 ms

Första 3 träffarna:

```json
[
  {
    "ehr": "122b7406-b005-4a30-a42a-f72c91f3529f",
    "hba1c": 76.43,
    "unit": "mmol/mol"
  },
  {
    "ehr": "81aadf38-5a9c-4a2e-932e-2ceb1abbe761",
    "hba1c": 88.49,
    "unit": "mmol/mol"
  },
  {
    "ehr": "2dcaf907-7053-46da-9afe-cf35a9b0bbb4",
    "hba1c": 70.88,
    "unit": "mmol/mol"
  }
]
```

### AQL-03 — Patienter med systoliskt BT > 160 (senaste mätning)

**Kategori:** A

**Beskrivning:** vital_signs-events i time_series — fixture-shape, ej migrerad i SDG-10. composer.name LIKE kvar.

```aql
SELECT e/ehr_id/value, c/composer/name, c/context/start_time/value
FROM EHR e
CONTAINS COMPOSITION c
WHERE c/composer/name LIKE '*vital_signs*BP*'
ORDER BY c/context/start_time/value DESC
```

**Resultat:** 106 rader (1776 råa), 310 ms

Första 3 träffarna:

```json
[
  {
    "ehr": "e49dd1ec-2840-4f08-b5de-a33d2294f5a4",
    "systolic": 196
  },
  {
    "ehr": "811b3613-9a88-4109-b09f-f16240c11ba9",
    "systolic": 211
  },
  {
    "ehr": "7265fc9e-31d4-4a6f-9fd1-4e7abbc125df",
    "systolic": 216
  }
]
```

### AQL-04 — Patienter med ≥ 5 medication_statement-events (polyfarmaci)

**Kategori:** A

**Beskrivning:** Räkna medication_summary-compositions per patient (äkta template-filter).

```aql
SELECT e/ehr_id/value
FROM EHR e
CONTAINS COMPOSITION c
CONTAINS EVALUATION m[openEHR-EHR-EVALUATION.medication_summary.v1]
```

**Resultat:** 145 rader (2431 råa), 229 ms

Första 3 träffarna:

```json
[
  {
    "ehr": "9b007d69-b609-441a-a09a-c35ab5812dbc",
    "medications": 8
  },
  {
    "ehr": "f46c5882-9b54-40fb-ad4c-4f40602abb6c",
    "medications": 5
  },
  {
    "ehr": "14fdbc03-a1f9-4ffa-bd5f-8279146b8bdd",
    "medications": 5
  }
]
```

### AQL-05 — Patienter med remiss (referral-event)

**Kategori:** A

**Beskrivning:** referral är fixture-shape (minimal_action.en.v1) — ej migrerad i SDG-10. composer.name LIKE kvar.

```aql
SELECT DISTINCT e/ehr_id/value
FROM EHR e
CONTAINS COMPOSITION c
WHERE c/composer/name LIKE '*referral*'
```

**Resultat:** 183 rader (183 råa), 156 ms

Första 3 träffarna:

```json
[
  [
    "02dba9de-9397-40a0-b941-5be97a1122b7"
  ],
  [
    "044420f8-cb16-4ab5-97d3-11049e0f861d"
  ],
  [
    "04d76c0e-241b-4c98-846b-fceffbbcc95b"
  ]
]
```

### AQL-06 — Diabetespatienter (E11) utan uppföljande HbA1c

**Kategori:** B

**Beskrivning:** OR-in-CONTAINS: pd E11 + lab HBA1C i samma resultset. Dropout = E11-diagnos finns men INGEN HbA1c alls efter diagnos. Inget tidsfönster (de-konflaterad). Diabetes nyckas på äkta E11 (Fas 3-normalisering), ej profil-tagg.

```aql
SELECT e/ehr_id/value,
       c/archetype_details/template_id/value,
       c/context/start_time/value,
       v/data[at0001]/items[at0003]/value/defining_code/code_string,
       o/data[at0001]/events[at0002]/data[at0003]/items[at0004]/value/value
FROM EHR e
CONTAINS COMPOSITION c
CONTAINS (EVALUATION v[openEHR-EHR-EVALUATION.problem_diagnosis.v1] OR OBSERVATION o[openEHR-EHR-OBSERVATION.laboratory_test_result.v1])
ORDER BY e/ehr_id/value, c/context/start_time/value
```

**Resultat:** 11 rader (3078 råa), 861 ms

Första 3 träffarna:

```json
[
  {
    "ehr": "82897d8b-e4e4-4169-b1e0-f435a4a909ed",
    "diagnosed": "2026-01-13T08:30:00Z",
    "followup_missing": true
  },
  {
    "ehr": "9939f63c-ba68-4a4a-abf6-641cc4b546df",
    "diagnosed": "2026-01-11T08:30:00Z",
    "followup_missing": true
  },
  {
    "ehr": "a27c26b3-d535-4f33-af78-dd297f8276fa",
    "diagnosed": "2026-01-12T08:30:00Z",
    "followup_missing": true
  }
]
```

### AQL-07 — HbA1c-trend per patient (första vs senaste värde)

**Kategori:** B

**Beskrivning:** Per patient: första och senaste HbA1c via DV_QUANTITY-magnitude (ej regex på annotation).

```aql
SELECT e/ehr_id/value, o/data[at0001]/events[at0002]/data[at0003]/items[at0006]/value/magnitude, c/context/start_time/value
FROM EHR e
CONTAINS COMPOSITION c
CONTAINS OBSERVATION o[openEHR-EHR-OBSERVATION.laboratory_test_result.v1]
WHERE o/data[at0001]/events[at0002]/data[at0003]/items[at0004]/value/value = 'HBA1C'
ORDER BY e/ehr_id/value, c/context/start_time/value
```

**Resultat:** 103 rader (266 råa), 375 ms

Första 3 träffarna:

```json
[
  {
    "ehr": "01036ada-e442-48fc-b4b7-41b911a0da13",
    "first": {
      "date": "2026-01-10T08:30:00Z",
      "val": 51.06
    },
    "last": {
      "date": "2026-05-11T08:30:00Z",
      "val": 35.7
    },
    "delta": -15.4
  },
  {
    "ehr": "061c9627-9450-4e32-9b86-9a35c9e2167a",
    "first": {
      "date": "2026-01-09T08:30:00Z",
      "val": 57.71
    },
    "last": {
      "date": "2026-05-10T08:30:00Z",
      "val": 57.71
    },
    "delta": 0
  },
  {
    "ehr": "07d9769f-d94b-4caf-b714-2e6af9fa898a",
    "first": {
      "date": "2026-01-11T08:30:00Z",
      "val": 106.55
    },
    "last": {
      "date": "2026-04-30T08:30:00Z",
      "val": 106.55
    },
    "delta": 0
  }
]
```

### AQL-08 — Median dagar från första kontakt till remiss (per profil)

**Kategori:** B

**Beskrivning:** encounter+referral är fixture — kvar på composer.name LIKE.

```aql
SELECT e/ehr_id/value, c/composer/name, c/context/start_time/value
FROM EHR e
CONTAINS COMPOSITION c
WHERE c/composer/name LIKE '*primary_care_encounter*' OR c/composer/name LIKE '*referral*'
ORDER BY e/ehr_id/value, c/context/start_time/value
```

**Resultat:** 11 rader (1237 råa), 242 ms

Första 3 träffarna:

```json
[
  {
    "profile": "hjartsvikt",
    "n": 43,
    "median_days": 2
  },
  {
    "profile": "kol",
    "n": 9,
    "median_days": 20
  },
  {
    "profile": "diabetes_typ",
    "n": 29,
    "median_days": 5
  }
]
```

### AQL-09 — Patienter med > 3 primary_care_encounter under 90 dagar

**Kategori:** B

**Beskrivning:** primary_care_encounter är fixture — composer.name LIKE kvar.

```aql
SELECT e/ehr_id/value, c/context/start_time/value
FROM EHR e
CONTAINS COMPOSITION c
WHERE c/composer/name LIKE '*primary_care_encounter*'
ORDER BY e/ehr_id/value, c/context/start_time/value
```

**Resultat:** 11 rader (1054 råa), 188 ms

Första 3 träffarna:

```json
[
  {
    "ehr": "0e6dd2d2-ccec-4e3f-b407-a5a78e9dfae2",
    "encounters": 5
  },
  {
    "ehr": "1ab40a29-5d01-4383-b71a-fe3b741d0a9f",
    "encounters": 4
  },
  {
    "ehr": "1b91b584-1358-4378-a586-a925a2970a32",
    "encounters": 4
  }
]
```

### AQL-10 — Patienter med förbättrade labbvärden efter läkemedelsinsättning

**Kategori:** B

**Beskrivning:** OR-in-CONTAINS lab+med. Patient där HbA1c sista < första OCH medication_summary mellan dessa.

```aql
SELECT e/ehr_id/value,
       c/archetype_details/template_id/value,
       c/context/start_time/value,
       o/data[at0001]/events[at0002]/data[at0003]/items[at0004]/value/value,
       o/data[at0001]/events[at0002]/data[at0003]/items[at0006]/value/magnitude
FROM EHR e
CONTAINS COMPOSITION c
CONTAINS (OBSERVATION o[openEHR-EHR-OBSERVATION.laboratory_test_result.v1] OR EVALUATION m[openEHR-EHR-EVALUATION.medication_summary.v1])
ORDER BY e/ehr_id/value, c/context/start_time/value
```

**Resultat:** 36 rader (3908 råa), 734 ms

Första 3 träffarna:

```json
[
  {
    "ehr": "01036ada-e442-48fc-b4b7-41b911a0da13",
    "first": {
      "date": "2026-01-10T08:30:00Z",
      "val": 51.06
    },
    "last": {
      "date": "2026-05-11T08:30:00Z",
      "val": 35.7
    },
    "rx_at": "2026-01-14T08:30:00Z",
    "delta": -15.4
  },
  {
    "ehr": "0f0e9ce8-0d9a-4b76-8c70-358f074ebf88",
    "first": {
      "date": "2026-01-11T08:30:00Z",
      "val": 55.86
    },
    "last": {
      "date": "2026-04-19T08:30:00Z",
      "val": 39.1
    },
    "rx_at": "2026-01-13T08:30:00Z",
    "delta": -16.8
  },
  {
    "ehr": "156ea520-1a32-404d-b64f-47955d37ac28",
    "first": {
      "date": "2026-01-10T08:30:00Z",
      "val": 55.59
    },
    "last": {
      "date": "2026-04-17T08:30:00Z",
      "val": 38.9
    },
    "rx_at": "2026-01-12T08:30:00Z",
    "delta": -16.7
  }
]
```

### AQL-11 — Äldre multisjuka patienter (≥3 ICD-diagnoser + polyfarmaci)

**Kategori:** C

**Beskrivning:** OR-in-CONTAINS pd+med. Fas 3 (Fork-4): ÄRLIG — räknar patienter med ≥3 DISTINKTA äkta ICD-diagnoser (mönster bokstav+siffra) OCH ≥5 medication_summary. Ej längre beroende av profil-taggen 'aldre_multisjuk' — komorbiditeterna härleds nu strukturellt ur medicinerna.

```aql
SELECT e/ehr_id/value,
       c/archetype_details/template_id/value,
       v/data[at0001]/items[at0003]/value/defining_code/code_string
FROM EHR e
CONTAINS COMPOSITION c
CONTAINS (EVALUATION v[openEHR-EHR-EVALUATION.problem_diagnosis.v1] OR EVALUATION m[openEHR-EHR-EVALUATION.medication_summary.v1])
```

**Resultat:** 107 rader (4032 råa), 345 ms

Första 3 träffarna:

```json
[
  {
    "ehr": "ee87e51a-40f7-4950-8967-40d477d8d21b",
    "distinct_icd": 6,
    "medications": 8
  },
  {
    "ehr": "6de405d0-8161-4f96-aa96-3c6a9a6da125",
    "distinct_icd": 5,
    "medications": 8
  },
  {
    "ehr": "25a587a7-baef-4aba-a37f-15eaf971dd6f",
    "distinct_icd": 7,
    "medications": 11
  }
]
```

### AQL-12 — Marianne Lindqvists fullständiga journal kronologiskt

**Kategori:** C

**Beskrivning:** Alla compositions för Marianne, sorterat efter datum. Subject-id-filter — ingen LIKE.

```aql
SELECT c/composer/name, c/context/start_time/value, c/uid/value
FROM EHR e
CONTAINS COMPOSITION c
WHERE e/ehr_status/subject/external_ref/id/value = 'marianne-lindqvist-syn-001'
ORDER BY c/context/start_time/value
```

**Resultat:** 22 rader (22 råa), 245 ms

Första 3 träffarna:

```json
[
  [
    "vital_signs | BP | systolic 130 mm[Hg] [unit=mm[Hg]]",
    "2026-01-08T08:30:00Z",
    "48805945-deb5-4c36-bc70-ec20df2b8d49::local.ehrbase.org::1"
  ],
  [
    "primary_care_encounter | first_visit | aldre_multisjuk initial contact [careflow=medication_review_visit]",
    "2026-01-08T08:30:00Z",
    "c9b18320-cb10-4200-ae3a-4f57ed290e14::local.ehrbase.org::1"
  ],
  [
    "lab_order | aldre_multisjuk | initial workup [careflow=lab_ordered]",
    "2026-01-08T08:30:00Z",
    "badaa733-2f9b-4c07-ac07-36201b425e66::local.ehrbase.org::1"
  ]
]
```

### AQL-13 — Patienter med >= 7 medication_statement (proxy för läkemedelsinteraktionsrisk)

**Kategori:** C

**Beskrivning:** Räkna medication_summary-compositions per patient (äkta template-filter).

```aql
SELECT e/ehr_id/value
FROM EHR e
CONTAINS COMPOSITION c
CONTAINS EVALUATION m[openEHR-EHR-EVALUATION.medication_summary.v1]
```

**Resultat:** 101 rader (2431 råa), 133 ms

Första 3 träffarna:

```json
[
  {
    "ehr": "9b007d69-b609-441a-a09a-c35ab5812dbc",
    "medications": 8
  },
  {
    "ehr": "2086853f-1e49-49b7-aa91-6775a81f91cc",
    "medications": 7
  },
  {
    "ehr": "533da1b7-3fde-40cd-bca7-ecd66c6a0e81",
    "medications": 8
  }
]
```

### AQL-14 — Patienter vars labbvärden FÖRSÄMRATS trots läkemedelsinsättning

**Kategori:** C

**Beskrivning:** Spegelbild av AQL-10: HbA1c sista > första, med medication_summary mellan.

```aql
SELECT e/ehr_id/value,
       c/archetype_details/template_id/value,
       c/context/start_time/value,
       o/data[at0001]/events[at0002]/data[at0003]/items[at0004]/value/value,
       o/data[at0001]/events[at0002]/data[at0003]/items[at0006]/value/magnitude
FROM EHR e
CONTAINS COMPOSITION c
CONTAINS (OBSERVATION o[openEHR-EHR-OBSERVATION.laboratory_test_result.v1] OR EVALUATION m[openEHR-EHR-EVALUATION.medication_summary.v1])
ORDER BY e/ehr_id/value, c/context/start_time/value
```

**Resultat:** 7 rader (3908 råa), 682 ms

Första 3 träffarna:

```json
[
  {
    "ehr": "0b6c6356-1c98-453c-832b-96266a6474af",
    "first": {
      "date": "2025-03-08T08:00:00Z",
      "val": 82
    },
    "last": {
      "date": "2025-07-15T08:00:00Z",
      "val": 88
    },
    "delta": 6
  },
  {
    "ehr": "27289811-530d-4a42-9eca-6b80d3ba58dc",
    "first": {
      "date": "2026-01-10T08:30:00Z",
      "val": 51.68
    },
    "last": {
      "date": "2026-04-05T08:30:00Z",
      "val": 59.4
    },
    "delta": 7.7
  },
  {
    "ehr": "4c0622a4-0e92-4218-8489-c33f55073f03",
    "first": {
      "date": "2026-01-10T08:30:00Z",
      "val": 54.84
    },
    "last": {
      "date": "2026-04-20T08:30:00Z",
      "val": 63.1
    },
    "delta": 8.3
  }
]
```

### AQL-15 — Median-magnitude per labbtyp (proxy för populationsstatistik)

**Kategori:** C

**Beskrivning:** Per analyt: median+min+max via DV_QUANTITY direkt. Client-side aggregering (AQL saknar GROUP BY).

```aql
SELECT o/data[at0001]/events[at0002]/data[at0003]/items[at0004]/value/value, o/data[at0001]/events[at0002]/data[at0003]/items[at0006]/value/magnitude, o/data[at0001]/events[at0002]/data[at0003]/items[at0006]/value/units
FROM EHR e
CONTAINS COMPOSITION c
CONTAINS OBSERVATION o[openEHR-EHR-OBSERVATION.laboratory_test_result.v1]
```

**Resultat:** 9 rader (1477 råa), 250 ms

Första 3 träffarna:

```json
[
  {
    "analyte": "HEMOGLOBIN",
    "unit": "g/L",
    "n": 380,
    "median": 112.21,
    "min": 62.26,
    "max": 149.42
  },
  {
    "analyte": "HBA1C",
    "unit": "mmol/mol",
    "n": 266,
    "median": 55,
    "min": 34.1,
    "max": 112.64
  },
  {
    "analyte": "SYSTOLIC_BP",
    "unit": "1",
    "n": 130,
    "median": 156.31,
    "min": 140.22,
    "max": 219.05
  }
]
```

