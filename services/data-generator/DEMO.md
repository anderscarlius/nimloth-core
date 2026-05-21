# Demo — Nimloth Syntetisk Patientdatagenerator

**Tid:** ~15 minuter
**Publik:** Tekniska och kliniska intressenter
**Förutsättningar:** EHRbase 2.x på `192.168.1.189:11401`, paketet `@nimloth-core/data-generator` installerat (`pnpm install` från monorepo-roten).

---

## Förberedelser (5 minuter innan demon)

Verifiera att EHRbase är upp och att de 3 fixture-templates är laddade:

```bash
curl -s http://192.168.1.189:11401/ehrbase/rest/openehr/v1/definition/template/adl1.4 \
  | jq length
# Förväntat: 3
```

Navigera till paketet:

```bash
cd ~/SynologyDrive/Hemmabasen/NorthFactor/VGR/nimloth-core/services/data-generator
```

Ha följande filer öppna i en editor som referens:
- `profiles/diabetes_typ2.yaml` — kliniska parametrar
- `pathways/diabetes_typ2_pathway.yaml` — state machine
- `src/composers/index.ts` — FLAT JSON-byggare

Öppna en andra terminal för parallella `curl`-AQL-anrop.

---

## Akt 1 — "Vi har 1 100 syntetiska patienter med vårdresor" *(1 minut)*

**Berätta:**
> Vi genererar realistisk syntetisk patientdata mot vår openEHR-stack. Inga riktiga personuppgifter, men kliniskt sammanhängande vårdförlopp som kan demonstrera AI-modeller och AQL-frågor.

**Visa snabbsiffror direkt från EHRbase:**

```bash
curl -s -X POST http://192.168.1.189:11401/ehrbase/rest/openehr/v1/query/aql \
  -H "Content-Type: application/json" \
  -d '{"q":"SELECT COUNT(e/ehr_id/value) FROM EHR e"}' \
  | jq '.rows[0][0]'
# Förväntat: 1104
```

```bash
curl -s -X POST http://192.168.1.189:11401/ehrbase/rest/openehr/v1/query/aql \
  -H "Content-Type: application/json" \
  -d '{"q":"SELECT COUNT(c/uid/value) FROM EHR e CONTAINS COMPOSITION c"}' \
  | jq '.rows[0][0]'
# Förväntat: 10471
```

**Säg:**
> 1 104 unika EHR:er, över 10 000 kliniska compositions. Allt round-trip-verifierat.

---

## Akt 2 — "En vårdresa byggs så här" *(3 minuter)*

**Berätta:**
> Varje patient produceras av en pipeline i fyra lager.

### Lager 1 — Profil (YAML: vad patienten är)

Öppna `profiles/diabetes_typ2.yaml`:

```yaml
profile_id: diabetes_typ2
demographics: { age_range: [45, 82], ... }
initial_labs:
  hba1c:
    mild:     { range: [48, 58], referral_prob: 0.15 }
    moderate: { range: [59, 80], referral_prob: 0.35 }
    severe:   { range: [81, 115], referral_prob: 0.75 }
common_medications:
  - { atc: A10BA02, name: metformin,    prob: 0.95 }
  - { atc: C10AA05, name: atorvastatin, prob: 0.70 }
```

**Peka på:** Klinisk struktur är data, inte hårdkod. En vårdcentralsläkare kan editera detta.

### Lager 2 — Vårdflöde (YAML: vad som händer)

Öppna `pathways/diabetes_typ2_pathway.yaml`:

```yaml
initial_state: first_contact_vc
states:
  await_lab:
    compositions: [lab_result]
    transitions:
      - to: diagnosis
        condition: always
  diagnosis:
    transitions:
      - to: specialist_referral
        condition: "lab.hba1c >= 70 OR severity == severe"
        compositions: [referral]
```

**Peka på:** State machine med villkor mot patientens labvärden. HbA1c ≥ 70 → automatisk remiss.

### Lager 3 — Generera en patient live (1 sekund)

```bash
pnpm tsx -e "
import { generateTimelines } from './src/engine/TimelineGenerator.js';
const t = generateTimelines({ profileId: 'diabetes_typ2', count: 1, seed: 9999 });
console.log('Patient:', t[0].patientId);
console.log('Demografi:', t[0].demographics);
console.log('Severity:', t[0].clinical.severity, '| HbA1c:', t[0].clinical.labs.hba1c);
console.log('Tidslinje:');
t[0].events.forEach(e => console.log('  dag', e.dayOffset, ':', e.eventType, '|', e.clinicalData.annotation));
"
```

**Förväntat:** 9–13 events i tidsordning från dag 0 till ~120.

### Lager 4 — Skicka till EHRbase

```bash
pnpm generate:load --profile diabetes_typ2 --count 1 --seed 9999
```

**Förväntat output:**

```
Loaded 1/1 patients fully. ~10 compositions in ~1.5s.
Spot check: 1/1 OK (100%)
```

**Säg:**
> Profil + pathway + engine = en patient. Skala till 1 000 patienter = ~13 minuter.

---

## Akt 3 — "Möt Marianne, vår ankarpatient" *(3 minuter)*

**Berätta:**
> Marianne Lindqvist är 79 år, multisjuk, går igenom hela demon. Hon laddas med fix seed 42 så hon ser identisk ut varje körning.

**Kör AQL-12 — Mariannes journal kronologiskt:**

```bash
pnpm demo:aql --id AQL-12
```

**Visa rapporten:**

```bash
sed -n '/AQL-12/,/AQL-13/p' queries/aql_demo_queries.md
```

Eller direkt mot EHRbase:

```bash
curl -s -X POST http://192.168.1.189:11401/ehrbase/rest/openehr/v1/query/aql \
  -H "Content-Type: application/json" \
  -d "{\"q\":\"SELECT c/context/start_time/value, c/composer/name FROM EHR e CONTAINS COMPOSITION c WHERE e/ehr_status/subject/external_ref/id/value = 'marianne-lindqvist-syn-001' ORDER BY c/context/start_time/value\"}" \
  | jq -r '.rows[] | "\(.[0])  \(.[1])"' \
  | head -15
```

**Förväntat:** ~28 rader i tidsordning:

```
2026-01-08T08:30:00Z  primary_care_encounter | first_visit | aldre_multisjuk initial contact ...
2026-01-08T08:30:00Z  vital_signs | BP | systolic ...
2026-01-08T08:30:00Z  lab_order | aldre_multisjuk | initial workup ...
2026-01-12T08:30:00Z  lab_result | HEMOGLOBIN | ...
2026-01-12T08:30:00Z  problem_diagnosis | aldre_multisjuk | severity=moderate
2026-01-12T08:30:00Z  medication_statement | C03CA01 | furosemide 20-80 mg/dag
2026-01-12T08:30:00Z  medication_statement | C07AB02 | metoprolol 25-100 mg/dag
2026-01-12T08:30:00Z  medication_statement | B01AA03 | warfarin individuell
... (~10 medications)
```

**Säg:**
> Det här är samma struktur som en verklig EHR. AQL kan rita upp tidslinjen. AI-modeller kan tränas på den.

---

## Akt 4 — "Kliniskt relevanta frågor" *(5 minuter)*

**Berätta:**
> Vi har 15 färdiga AQL-demofrågor i tre kategorier.

### Kategori A — Grundläggande populationssökning

```bash
pnpm demo:aql --category A
```

**Förväntade siffror:**

| Fråga | Beskrivning | Antal |
|---|---|---:|
| AQL-01 | Patienter med diabetes | 113 |
| AQL-02 | HbA1c > 70 (senaste värdet) | 29 |
| AQL-03 | Systoliskt BT > 160 | 106 |
| AQL-04 | ≥ 5 läkemedel (polyfarmaci) | 98 |
| AQL-05 | Patienter med remiss | 197 |

**Säg:**
> Det här är frågor en vårdcentral skulle ställa: hur många diabetiker har vi, vilka är dåligt inställda, vilka har polyfarmaci.

### Kategori B — Temporal analys

```bash
pnpm demo:aql --id AQL-07
```

**Visa:** HbA1c-trend per patient — första värde, senaste värde, delta. 114 patienter med fler än 1 mätning.

**Diskutera:**
> Det här är AI-relevant. En modell kan tränas att förutsäga vem som inte svarar på behandling.

```bash
pnpm demo:aql --id AQL-08
```

**Visa:** Median dagar från första kontakt till remiss per profil — en kvalitetsindikator.

### Kategori C — Komplexa kliniska samband

```bash
pnpm demo:aql --id AQL-11
```

**Visa:** 98 äldre multisjuka med polyfarmaci. Marianne ingår i resultatet — klassisk riskgrupp.

```bash
pnpm demo:aql --id AQL-13
```

**Visa:** 80 patienter med ≥ 7 läkemedel — proxy för läkemedelsinteraktionsrisk.

**Säg:**
> Det här är frågor som tar 5-10 minuter manuellt i Take Care. Här är de 100-300 ms mot syntetisk data.

---

## Akt 5 — "Vad det här inte är" *(1 minut)*

**Berätta:**
> Två tekniska skuldposter ska nämnas så ni inte tror vi är längre än vi är:

1. **Compositions skrivs mot 3 generiska "fixture-shapes"** istället för 10 domänspecifika openEHR-templates. Vår ADL→OPT-compiler (P3.0b) är öppet arbete. Konsekvens: HbA1c-värden bärs som generiska kvantiteter i `time_series.en.v1`. Riktig openEHR-deployering kräver att vi färdigställer compilern.
2. **Diagnoskoder och läkemedelsnamn ligger i `composer.name` istället för strukturerade fält.** AQL hittar dem via `LIKE`-mönster. Helt fine för demo, ej production-grade.

**Säg:**
> När P3.0b är klar byter vi composers utan att röra SDG-03 till SDG-08-lagren. Pipelinen är redan rätt — bara substratlagret saknar semantisk skärpa.

---

## Reproducerbarhet (om någon frågar)

```bash
pnpm tsx src/scripts/sdg07-scale.ts
```

~13 minuter mot lokal EHRbase, deterministisk via seeds.

Allt seedbart, allt versionshanterat under `services/data-generator/`, allt mätbart via:

- `data/population_report.md` — slutläget efter 1 000-patient-körningen
- `queries/aql_demo_queries.md` — senaste AQL-resultaten
- `queries/query_results.json` — råa rader för efteranalys

---

## Demo-skript (cheat sheet)

| Tid | Akt | Kommando |
|---|---|---|
| 0:00 | Sätta scenen | `curl ... \| jq '.rows[0][0]'` (1104) |
| 1:00 | Profil-YAML | Visa `diabetes_typ2.yaml` |
| 2:00 | Pathway-YAML | Visa `diabetes_typ2_pathway.yaml` |
| 3:30 | Live-generera 1 | `pnpm tsx -e "..."` |
| 4:30 | Live-ladda 1 | `pnpm generate:load --profile diabetes_typ2 --count 1 --seed 9999` |
| 5:30 | Marianne | `pnpm demo:aql --id AQL-12` |
| 8:30 | Kategori A | `pnpm demo:aql --category A` |
| 10:00 | AQL-07 trend | `pnpm demo:aql --id AQL-07` |
| 11:30 | AQL-11 polyfarmaci | `pnpm demo:aql --id AQL-11` |
| 13:00 | Vad återstår | Berätta P3.0b-skuld |
| 14:30 | Frågor | — |
