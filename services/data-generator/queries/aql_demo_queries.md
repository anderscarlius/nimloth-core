# SDG-08 — AQL-demofrågor

Genererad: 2026-05-21T22:12:16.570Z
EHRbase: http://192.168.1.189:11401/ehrbase

## Sammanfattning

| ID | Titel | Resultat | Tid (ms) |
|---|---|---:|---:|
| AQL-01 | Patienter med diagnos diabetes typ 2 | 113 | 92 |
| AQL-02 | Patienter med HbA1c > 70 (senaste värdet) | 29 | 106 |
| AQL-03 | Patienter med systoliskt BT > 160 (senaste mätning) | 106 | 395 |
| AQL-04 | Patienter med ≥ 5 medication_statement-events (polyfarmaci) | 98 | 359 |
| AQL-05 | Patienter med remiss (referral-event) | 197 | 93 |
| AQL-06 | Diabetespatienter utan uppföljande HbA1c inom 90 dagar | 0 | 141 |
| AQL-07 | HbA1c-trend per patient (första vs senaste värde) | 114 | 80 |
| AQL-08 | Median dagar från första kontakt till remiss (per profil) | 11 | 122 |
| AQL-09 | Patienter med > 3 primary_care_encounter under 90 dagar | 0 | 238 |
| AQL-10 | Patienter med förbättrade labbvärden efter läkemedelsinsättning | 1 | 146 |
| AQL-11 | Äldre multisjuka patienter (proxy: aldre_multisjuk-profil) | 98 | 131 |
| AQL-12 | Marianne Lindqvists fullständiga journal kronologiskt | 28 | 54 |
| AQL-13 | Patienter med >= 7 medication_statement (proxy för läkemedelsinteraktionsrisk) | 80 | 366 |
| AQL-14 | Patienter vars labbvärden FÖRSÄMRATS trots läkemedelsinsättning | 0 | 136 |
| AQL-15 | Median-magnitude per diagnosgrupp (proxy för populationsstatistik) | 2 | 276 |

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

**Resultat:** 113 rader (113 råa), 92 ms

Första 3 träffarna:

```json
[
  [
    "003d1250-7d9f-425b-87f2-cdb8630beae1"
  ],
  [
    "009b351c-f310-462d-8a88-9460b063fb0b"
  ],
  [
    "01a8c565-65fd-4531-a269-6e7f1bbc3009"
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

**Resultat:** 29 rader (232 råa), 106 ms

Första 3 träffarna:

```json
[
  {
    "ehr": "c51052b4-5b95-4838-8a76-03fc0d7461a4",
    "hba1c": 77.41
  },
  {
    "ehr": "240662c4-1301-4bac-9c8a-40faccca03db",
    "hba1c": 112.5
  },
  {
    "ehr": "fcc9fecd-1661-4094-900e-21645cb415e0",
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

**Resultat:** 106 rader (1981 råa), 395 ms

Första 3 träffarna:

```json
[
  {
    "ehr": "ea186fea-2b82-4557-bb29-f13f25b04871",
    "systolic": 191
  },
  {
    "ehr": "b1a3dc07-0333-476b-a8b7-8362f270071d",
    "systolic": 183
  },
  {
    "ehr": "93b43b1d-0d1d-4f9d-b27e-d224011332fb",
    "systolic": 178
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

**Resultat:** 98 rader (1894 råa), 359 ms

Första 3 träffarna:

```json
[
  {
    "ehr": "7d1eb30e-dcf6-4570-a992-603aa1b95802",
    "medications": 10
  },
  {
    "ehr": "6e156501-a627-4ec4-8294-caa3f0125297",
    "medications": 7
  },
  {
    "ehr": "3a2f4b1d-8b5b-4156-b88f-c44186adfe4c",
    "medications": 7
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

**Resultat:** 197 rader (197 råa), 93 ms

Första 3 träffarna:

```json
[
  [
    "003c13e1-51db-4606-aa91-a6ec62c1ba8b"
  ],
  [
    "01de3b4d-c60f-469d-9371-66c3b3fbb738"
  ],
  [
    "022206d1-e877-4c30-974d-d4a11c945d11"
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

**Resultat:** 0 rader (855 råa), 141 ms

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

**Resultat:** 114 rader (232 råa), 80 ms

Första 3 träffarna:

```json
[
  {
    "ehr": "003d1250-7d9f-425b-87f2-cdb8630beae1",
    "first": {
      "date": "2026-05-21T21:54:32.60155509Z",
      "val": 51.1
    },
    "last": {
      "date": "2026-05-21T21:54:32.842578143Z",
      "val": 51.1
    },
    "delta": 0
  },
  {
    "ehr": "009b351c-f310-462d-8a88-9460b063fb0b",
    "first": {
      "date": "2026-05-21T21:54:43.314488615Z",
      "val": 51.36
    },
    "last": {
      "date": "2026-05-21T21:54:43.540487263Z",
      "val": 51.36
    },
    "delta": 0
  },
  {
    "ehr": "01a8c565-65fd-4531-a269-6e7f1bbc3009",
    "first": {
      "date": "2026-05-21T21:54:44.472308032Z",
      "val": 50.13
    },
    "last": {
      "date": "2026-05-21T21:54:44.665854055Z",
      "val": 50.13
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

**Resultat:** 11 rader (1306 råa), 122 ms

Första 3 träffarna:

```json
[
  {
    "profile": "hjartsvikt",
    "n": 43,
    "median_days": 0
  },
  {
    "profile": "anemi",
    "n": 22,
    "median_days": 0
  },
  {
    "profile": "aldre_multisjuk",
    "n": 27,
    "median_days": 0
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

**Resultat:** 0 rader (1107 råa), 238 ms

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

**Resultat:** 1 rader (2126 råa), 146 ms

Första 3 träffarna:

```json
[
  {
    "ehr": "cdc026d9-3ff2-496d-a8bd-e1ef3bd661d1",
    "first": {
      "date": "2026-05-21T18:36:16.134954386Z",
      "val": 82
    },
    "last": {
      "date": "2026-05-21T18:38:13.219692244Z",
      "val": 68
    },
    "rx_at": "2026-05-21T18:36:16.604018836Z",
    "delta": -14
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

**Resultat:** 98 rader (3003 råa), 131 ms

Första 3 träffarna:

```json
[
  {
    "ehr": "7d1eb30e-dcf6-4570-a992-603aa1b95802",
    "medications": 10
  },
  {
    "ehr": "3a2f4b1d-8b5b-4156-b88f-c44186adfe4c",
    "medications": 7
  },
  {
    "ehr": "5224c1d4-57e2-43a5-8a98-8cc0f2452ef0",
    "medications": 7
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

**Resultat:** 28 rader (28 råa), 54 ms

Första 3 träffarna:

```json
[
  [
    "primary_care_encounter | first_visit | aldre_multisjuk initial contact [careflow=medication_review_visit]",
    "2026-05-21T21:53:17.376988218Z",
    "fecb37de-8e5f-457f-97ea-08ceac99c366::local.ehrbase.org::1"
  ],
  [
    "vital_signs | BP | systolic 130 mm[Hg] [unit=mm[Hg]]",
    "2026-05-21T21:53:17.641298687Z",
    "1e6a8e1a-4858-436a-b5ff-265706c895ac::local.ehrbase.org::1"
  ],
  [
    "lab_order | aldre_multisjuk | initial workup [careflow=lab_ordered]",
    "2026-05-21T21:53:17.799955454Z",
    "8e89464e-ba1a-4b90-8543-8acd7956450f::local.ehrbase.org::1"
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

**Resultat:** 80 rader (1894 råa), 366 ms

Första 3 träffarna:

```json
[
  {
    "ehr": "7d1eb30e-dcf6-4570-a992-603aa1b95802",
    "medications": 10
  },
  {
    "ehr": "6e156501-a627-4ec4-8294-caa3f0125297",
    "medications": 7
  },
  {
    "ehr": "3a2f4b1d-8b5b-4156-b88f-c44186adfe4c",
    "medications": 7
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

**Resultat:** 0 rader (2126 råa), 136 ms

### AQL-15 — Median-magnitude per diagnosgrupp (proxy för populationsstatistik)

**Kategori:** C

**Beskrivning:** Per profil: median av magnitudvärden från lab_result-compositions. Client-side aggregering.

```aql
SELECT e/ehr_id/value, c/composer/name
FROM EHR e
CONTAINS COMPOSITION c
WHERE c/composer/name LIKE '*lab_result*'
```

**Resultat:** 2 rader (1634 råa), 276 ms

Första 3 träffarna:

```json
[
  {
    "bucket": "HBA1C",
    "n": 232,
    "median": 57.11,
    "min": 48.47,
    "max": 112.64
  },
  {
    "bucket": "HEMOGLOBIN",
    "n": 582,
    "median": 113.95,
    "min": 62.26,
    "max": 149.42
  }
]
```

