# SDG-08 — AQL-demofrågor

Genererad: 2026-05-26T20:42:56.659Z
EHRbase: http://192.168.1.189:11401/ehrbase

## Sammanfattning

| ID | Titel | Resultat | Tid (ms) |
|---|---|---:|---:|
| AQL-01 | Patienter med diagnos diabetes typ 2 | 110 | 98 |
| AQL-02 | Patienter med HbA1c > 70 (senaste värdet) | 29 | 152 |
| AQL-03 | Patienter med systoliskt BT > 160 (senaste mätning) | 106 | 411 |
| AQL-04 | Patienter med ≥ 5 medication_statement-events (polyfarmaci) | 144 | 460 |
| AQL-05 | Patienter med remiss (referral-event) | 183 | 126 |
| AQL-06 | Diabetespatienter utan uppföljande HbA1c inom 90 dagar | 75 | 263 |
| AQL-07 | HbA1c-trend per patient (första vs senaste värde) | 101 | 159 |
| AQL-08 | Median dagar från första kontakt till remiss (per profil) | 11 | 224 |
| AQL-09 | Patienter med > 3 primary_care_encounter under 90 dagar | 10 | 284 |
| AQL-10 | Patienter med förbättrade labbvärden efter läkemedelsinsättning | 35 | 285 |
| AQL-11 | Äldre multisjuka patienter (proxy: aldre_multisjuk-profil) | 107 | 295 |
| AQL-12 | Marianne Lindqvists fullständiga journal kronologiskt | 17 | 205 |
| AQL-13 | Patienter med >= 7 medication_statement (proxy för läkemedelsinteraktionsrisk) | 101 | 417 |
| AQL-14 | Patienter vars labbvärden FÖRSÄMRATS trots läkemedelsinsättning | 6 | 229 |
| AQL-15 | Median-magnitude per diagnosgrupp (proxy för populationsstatistik) | 2 | 331 |

## Frågor i detalj

### AQL-01 — Patienter med diagnos diabetes typ 2

**Kategori:** A

**Beskrivning:** Alla patienter med problem_diagnosis-event för diabetes_typ2 (ICD E11).

```aql
SELECT DISTINCT e/ehr_id/value
FROM EHR e
CONTAINS COMPOSITION c
WHERE c/composer/name LIKE '*problem_diagnosis*diabetes_typ2*'
```

**Resultat:** 110 rader (110 råa), 98 ms

Första 3 träffarna:

```json
[
  [
    "0253dcf3-da2b-417c-88d8-1ef9c9c829fa"
  ],
  [
    "02c24fad-dffa-440d-a1fb-62ce0f29c876"
  ],
  [
    "03b61f94-19b5-45d1-9e7d-b0d472475f87"
  ]
]
```

### AQL-02 — Patienter med HbA1c > 70 (senaste värdet)

**Kategori:** A

**Beskrivning:** lab_result-compositions med composer.name innehållande HBA1C och magnitude > 70. Senaste värde per patient bestäms client-side.

```aql
SELECT e/ehr_id/value, c/composer/name, c/context/start_time/value
FROM EHR e
CONTAINS COMPOSITION c CONTAINS OBSERVATION o
WHERE c/composer/name LIKE '*HBA1C*'
ORDER BY c/context/start_time/value DESC
```

**Resultat:** 29 rader (212 råa), 152 ms

Första 3 träffarna:

```json
[
  {
    "ehr": "eb983a18-ef3f-439f-a0ef-89d55cc1bb70",
    "hba1c": 76.43
  },
  {
    "ehr": "5d9ce982-635c-4d3c-99c4-e667e79f38ee",
    "hba1c": 88.49
  },
  {
    "ehr": "63e0ea23-2ad8-453a-81f3-1dae7095c9a7",
    "hba1c": 70.88
  }
]
```

### AQL-03 — Patienter med systoliskt BT > 160 (senaste mätning)

**Kategori:** A

**Beskrivning:** vital_signs-events med magnitude > 160 i time_series (representerar systoliskt BT).

```aql
SELECT e/ehr_id/value, c/composer/name, c/context/start_time/value
FROM EHR e
CONTAINS COMPOSITION c
WHERE c/composer/name LIKE '*vital_signs*BP*'
ORDER BY c/context/start_time/value DESC
```

**Resultat:** 106 rader (1776 råa), 411 ms

Första 3 träffarna:

```json
[
  {
    "ehr": "d331a86b-1de1-4d02-acdb-677fdc9d7f7f",
    "systolic": 196
  },
  {
    "ehr": "f071151a-2978-439f-b618-2e956a7df4aa",
    "systolic": 211
  },
  {
    "ehr": "ee8dc5af-abaa-44df-a81f-ee61bb9bdde3",
    "systolic": 216
  }
]
```

### AQL-04 — Patienter med ≥ 5 medication_statement-events (polyfarmaci)

**Kategori:** A

**Beskrivning:** Räkna medication_statement per patient. Eftersom AQL saknar GROUP BY görs aggregeringen client-side.

```aql
SELECT e/ehr_id/value
FROM EHR e
CONTAINS COMPOSITION c
WHERE c/composer/name LIKE '*medication_statement*'
```

**Resultat:** 144 rader (2422 råa), 460 ms

Första 3 träffarna:

```json
[
  {
    "ehr": "63dc00ee-881a-4103-8756-c63b15d8b214",
    "medications": 8
  },
  {
    "ehr": "88433a58-3858-4018-a84d-a3fcf3860188",
    "medications": 5
  },
  {
    "ehr": "b1f74d27-7fb8-45f5-b57a-c29739d24338",
    "medications": 5
  }
]
```

### AQL-05 — Patienter med remiss (referral-event)

**Kategori:** A

**Beskrivning:** DISTINCT EHR med minst en referral-composition.

```aql
SELECT DISTINCT e/ehr_id/value
FROM EHR e
CONTAINS COMPOSITION c
WHERE c/composer/name LIKE '*referral*'
```

**Resultat:** 183 rader (183 råa), 126 ms

Första 3 träffarna:

```json
[
  [
    "0253dcf3-da2b-417c-88d8-1ef9c9c829fa"
  ],
  [
    "03b61f94-19b5-45d1-9e7d-b0d472475f87"
  ],
  [
    "042a06b3-e782-499e-b503-47577cd69592"
  ]
]
```

### AQL-06 — Diabetespatienter utan uppföljande HbA1c inom 90 dagar

**Kategori:** B

**Beskrivning:** Diabetes-patienter (problem_diagnosis*diabetes_typ2) som saknar lab_result*HBA1C minst 90 dagar efter diagnostidpunkt. Aggregeras client-side.

```aql
SELECT e/ehr_id/value, c/composer/name, c/context/start_time/value
FROM EHR e
CONTAINS COMPOSITION c
WHERE c/composer/name LIKE '*diabetes_typ2*' OR c/composer/name LIKE '*HBA1C*'
ORDER BY e/ehr_id/value, c/context/start_time/value
```

**Resultat:** 75 rader (700 råa), 263 ms

Första 3 träffarna:

```json
[
  {
    "ehr": "0253dcf3-da2b-417c-88d8-1ef9c9c829fa",
    "diagnosed": "2026-01-15T08:30:00Z",
    "followup_days": 104
  },
  {
    "ehr": "02c24fad-dffa-440d-a1fb-62ce0f29c876",
    "diagnosed": "2026-01-14T08:30:00Z",
    "followup_days": 117
  },
  {
    "ehr": "03b61f94-19b5-45d1-9e7d-b0d472475f87",
    "diagnosed": "2026-01-15T08:30:00Z",
    "followup_days": 115
  }
]
```

### AQL-07 — HbA1c-trend per patient (första vs senaste värde)

**Kategori:** B

**Beskrivning:** Per diabetes-patient: hitta första och senaste HbA1c, beräkna förändring. Aggregering client-side.

```aql
SELECT e/ehr_id/value, c/composer/name, c/context/start_time/value
FROM EHR e
CONTAINS COMPOSITION c
WHERE c/composer/name LIKE '*HBA1C*'
ORDER BY e/ehr_id/value, c/context/start_time/value
```

**Resultat:** 101 rader (212 råa), 159 ms

Första 3 träffarna:

```json
[
  {
    "ehr": "0253dcf3-da2b-417c-88d8-1ef9c9c829fa",
    "first": {
      "date": "2026-01-11T08:30:00Z",
      "val": 74.16
    },
    "last": {
      "date": "2026-04-29T08:30:00Z",
      "val": 74.16
    },
    "delta": 0
  },
  {
    "ehr": "02c24fad-dffa-440d-a1fb-62ce0f29c876",
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
    "ehr": "03b61f94-19b5-45d1-9e7d-b0d472475f87",
    "first": {
      "date": "2026-01-10T08:30:00Z",
      "val": 112.64
    },
    "last": {
      "date": "2026-05-10T08:30:00Z",
      "val": 112.64
    },
    "delta": 0
  }
]
```

### AQL-08 — Median dagar från första kontakt till remiss (per profil)

**Kategori:** B

**Beskrivning:** Per profil: median(dagar mellan primary_care_encounter och referral) — aggregering client-side.

```aql
SELECT e/ehr_id/value, c/composer/name, c/context/start_time/value
FROM EHR e
CONTAINS COMPOSITION c
WHERE c/composer/name LIKE '*primary_care_encounter*' OR c/composer/name LIKE '*referral*'
ORDER BY e/ehr_id/value, c/context/start_time/value
```

**Resultat:** 11 rader (1228 råa), 224 ms

Första 3 träffarna:

```json
[
  {
    "profile": "diabetes_typ",
    "n": 29,
    "median_days": 5
  },
  {
    "profile": "hjartsvikt",
    "n": 43,
    "median_days": 2
  },
  {
    "profile": "brostsmarta",
    "n": 10,
    "median_days": 1
  }
]
```

### AQL-09 — Patienter med > 3 primary_care_encounter under 90 dagar

**Kategori:** B

**Beskrivning:** Per patient: räkna primary_care_encounter; flagga om > 3 inom 90 dagar.

```aql
SELECT e/ehr_id/value, c/context/start_time/value
FROM EHR e
CONTAINS COMPOSITION c
WHERE c/composer/name LIKE '*primary_care_encounter*'
ORDER BY e/ehr_id/value, c/context/start_time/value
```

**Resultat:** 10 rader (1045 råa), 284 ms

Första 3 träffarna:

```json
[
  {
    "ehr": "075caecf-6c00-4309-999b-4f916710211b",
    "encounters": 4
  },
  {
    "ehr": "0b91fae0-d6bd-4477-895f-a10662210b78",
    "encounters": 4
  },
  {
    "ehr": "40bbedd2-1d62-4063-8622-88cadd7375ea",
    "encounters": 4
  }
]
```

### AQL-10 — Patienter med förbättrade labbvärden efter läkemedelsinsättning

**Kategori:** B

**Beskrivning:** Patienter där HbA1c sista mätningen är lägre än första, och en medication_statement existerar mellan dessa.

```aql
SELECT e/ehr_id/value, c/composer/name, c/context/start_time/value
FROM EHR e
CONTAINS COMPOSITION c
WHERE c/composer/name LIKE '*HBA1C*' OR c/composer/name LIKE '*medication_statement*'
ORDER BY e/ehr_id/value, c/context/start_time/value
```

**Resultat:** 35 rader (2634 råa), 285 ms

Första 3 träffarna:

```json
[
  {
    "ehr": "02c24fad-dffa-440d-a1fb-62ce0f29c876",
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
    "ehr": "108fd673-5002-41db-9559-890748bc5320",
    "first": {
      "date": "2026-01-11T08:30:00Z",
      "val": 60.5
    },
    "last": {
      "date": "2026-04-02T08:30:00Z",
      "val": 42.3
    },
    "rx_at": "2026-01-13T08:30:00Z",
    "delta": -18.2
  },
  {
    "ehr": "17c41eda-1523-4979-b537-13e63c03669a",
    "first": {
      "date": "2026-01-10T08:30:00Z",
      "val": 69.47
    },
    "last": {
      "date": "2026-03-30T08:30:00Z",
      "val": 48.6
    },
    "rx_at": "2026-01-15T08:30:00Z",
    "delta": -20.9
  }
]
```

### AQL-11 — Äldre multisjuka patienter (proxy: aldre_multisjuk-profil)

**Kategori:** C

**Beskrivning:** Patienter med problem_diagnosis*aldre_multisjuk OCH minst 5 medication_statement (polyfarmaci). Marianne ska träffas.

```aql
SELECT e/ehr_id/value, c/composer/name
FROM EHR e
CONTAINS COMPOSITION c
WHERE c/composer/name LIKE '*aldre_multisjuk*' OR c/composer/name LIKE '*medication_statement*'
```

**Resultat:** 107 rader (2998 råa), 295 ms

Första 3 träffarna:

```json
[
  {
    "ehr": "63dc00ee-881a-4103-8756-c63b15d8b214",
    "medications": 8
  },
  {
    "ehr": "5ae92a04-2ee5-42ce-b857-0cc35c05b7d4",
    "medications": 5
  },
  {
    "ehr": "370c55e1-b824-4e48-bf1a-8cb5bc974349",
    "medications": 6
  }
]
```

### AQL-12 — Marianne Lindqvists fullständiga journal kronologiskt

**Kategori:** C

**Beskrivning:** Alla compositions för Marianne, sorterat efter datum.

```aql
SELECT c/composer/name, c/context/start_time/value, c/uid/value
FROM EHR e
CONTAINS COMPOSITION c
WHERE e/ehr_status/subject/external_ref/id/value = 'marianne-lindqvist-syn-001'
ORDER BY c/context/start_time/value
```

**Resultat:** 17 rader (17 råa), 205 ms

Första 3 träffarna:

```json
[
  [
    "lab_order | aldre_multisjuk | initial workup [careflow=lab_ordered]",
    "2026-01-08T08:30:00Z",
    "e9ca67bc-ec5c-4993-8982-a11680cc884a::local.ehrbase.org::1"
  ],
  [
    "primary_care_encounter | first_visit | aldre_multisjuk initial contact [careflow=medication_review_visit]",
    "2026-01-08T08:30:00Z",
    "e0f28cc2-7107-4acd-b290-1f4208e00578::local.ehrbase.org::1"
  ],
  [
    "vital_signs | BP | systolic 130 mm[Hg] [unit=mm[Hg]]",
    "2026-01-08T08:30:00Z",
    "5df790e6-dc97-4801-a965-5419f56a52f1::local.ehrbase.org::1"
  ]
]
```

### AQL-13 — Patienter med >= 7 medication_statement (proxy för läkemedelsinteraktionsrisk)

**Kategori:** C

**Beskrivning:** Specens warfarin+NSAID-fråga kan inte uppfyllas semantiskt i fixture-shapes. Använder polyfarmaci-proxy istället.

```aql
SELECT e/ehr_id/value
FROM EHR e
CONTAINS COMPOSITION c
WHERE c/composer/name LIKE '*medication_statement*'
```

**Resultat:** 101 rader (2422 råa), 417 ms

Första 3 träffarna:

```json
[
  {
    "ehr": "63dc00ee-881a-4103-8756-c63b15d8b214",
    "medications": 8
  },
  {
    "ehr": "c0759d9c-d1a8-4de9-9d05-84ca8d415158",
    "medications": 7
  },
  {
    "ehr": "3b50b9e8-cfac-4175-82af-abfce4b22242",
    "medications": 8
  }
]
```

### AQL-14 — Patienter vars labbvärden FÖRSÄMRATS trots läkemedelsinsättning

**Kategori:** C

**Beskrivning:** Spegelbild av AQL-10: HbA1c sista > första, med medication_statement mellan.

```aql
SELECT e/ehr_id/value, c/composer/name, c/context/start_time/value
FROM EHR e
CONTAINS COMPOSITION c
WHERE c/composer/name LIKE '*HBA1C*' OR c/composer/name LIKE '*medication_statement*'
ORDER BY e/ehr_id/value, c/context/start_time/value
```

**Resultat:** 6 rader (2634 råa), 229 ms

Första 3 träffarna:

```json
[
  {
    "ehr": "499e7bab-d659-433c-974f-0c887ecd733d",
    "first": {
      "date": "2026-01-09T08:30:00Z",
      "val": 59.11
    },
    "last": {
      "date": "2026-05-01T08:30:00Z",
      "val": 68
    },
    "delta": 8.9
  },
  {
    "ehr": "5011513f-9d92-4882-aad9-d602125129b3",
    "first": {
      "date": "2026-01-10T08:30:00Z",
      "val": 57.48
    },
    "last": {
      "date": "2026-03-23T08:30:00Z",
      "val": 66.1
    },
    "delta": 8.6
  },
  {
    "ehr": "8b3d4d35-644d-4dc7-8bd7-eca9e4355d05",
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

### AQL-15 — Median-magnitude per diagnosgrupp (proxy för populationsstatistik)

**Kategori:** C

**Beskrivning:** Per profil: median av magnitudvärden från lab_result-compositions. Client-side aggregering.

```aql
SELECT e/ehr_id/value, c/composer/name
FROM EHR e
CONTAINS COMPOSITION c
WHERE c/composer/name LIKE '*lab_result*'
```

**Resultat:** 2 rader (1422 råa), 331 ms

Första 3 träffarna:

```json
[
  {
    "bucket": "HBA1C",
    "n": 212,
    "median": 55.74,
    "min": 34.1,
    "max": 112.64
  },
  {
    "bucket": "HEMOGLOBIN",
    "n": 380,
    "median": 112.21,
    "min": 62.26,
    "max": 149.42
  }
]
```

