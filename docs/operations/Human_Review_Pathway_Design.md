# Human Review Pathway — Design Rationale

**Status:** P4-leverans (Sprint 2). Implementerat i `services/composition-mapper/src/mapping/aggregator.ts`.
**Senast uppdaterad:** 2026-05-08
**Författare:** Anders Carlius
**Spec-referens:** `nimloth-docs/P4_Composition_Mapper.md` sektion 4.6 + 4.6b
**Versionerat:** ja (i nimloth-core).

---

## 1. Problembeskrivning

`composition-mapper` utför FHIR R4 → openEHR-mappning per fält. Två
mappningstyper:

- **Deterministisk** (6 fält i P4): 1:1-relationer från FHIR-struktur till
  openEHR `medication_summary.v1`-fält. `mapMedicationName`,
  `mapStatus`, `mapStartTime`, `mapRoute`, `mapSequence`, `mapSubject`.
  Returnerar `MappedField<T>` med `confidence: 1.0` eller `null`.

- **LLM-assisterad** (4 fält i P4): tolkar fri text och tvetydiga värden.
  `parseDosageText`, `parseDosageTiming`, `inferStatus`, `suggestAtc`.
  Returnerar `LlmField<T>` med `confidence: 0..1` och `reasoning`.

För patientsäkerhet kan en mappning aldrig blint accepteras när modellen är
osäker eller källdata är otydlig. **Human review är en strukturell del av
pipelinen, inte en eskaleringsmekanism.** Den triggers automatiskt när tre
specifika villkor inträffar och producerar en strukturerad payload som
gör granskningen direktstyrd.

## 2. Triggervillkor

`aggregate()` evaluerar i ordning. Första matchande trigger sätter
`status: 'human-review-required'` och returnerar `HumanReviewPayload`.

### 2.1 `missing_required_field`

Required-fält enligt `REQUIRED_FIELD_KEYS` i `src/types/review.ts`:
`medicationName`, `status`, `subject`.

Om något av dessa är `null` efter både deterministic + (eventuell) LLM-assist
→ trigger.

**Exempel ur eval-set:**

- `med-041` — `entered-in-error`-status med saknad route + tvetydig dosage.
  Mapping kan inte producera `status` (deterministic→null, LLM-inferens
  ger också null pga tvetydighet) → review.
- `med-049` — `unknown`-status, ingen `effective`, dosage="som tidigare".
  Worst-case för human-review.

### 2.2 `conflicting_evidence`

När både deterministic och LLM producerar värde för samma fält men värdena
skiljer.

**Implementation idag:**

- `medicationName`: om deterministic ger ATC-kod X och `suggestAtc` LLM-
  fallback ger kod Y, och X ≠ Y → flagga.
- `status`: om deterministic ger ISM-state X (från FHIR-status) och
  `inferStatus` LLM-fallback ger Y, och X ≠ Y → flagga.

**Default-beteende:** deterministic vinner i `composition`-output, men
review triggas. Detta är ett medvetet konservativt val: divergens kan
indikera datakvalitetsproblem i källan (t.ex. fel ATC-kod registrerad)
som kliniker bör se.

### 2.3 `low_confidence`

Om båda ovan inte triggar och `aggregateConfidence < threshold` (default
`0.7`).

`aggregateConfidence = min(confidence)` över alla fält som inte är
`source: 'unknown'` (dvs där värde producerats). Se sektion 3.

## 3. Confidence-aggregering — min-rule

Alternativen vi övervägde:

| Regel | Konsekvens | Patient-säkerhet |
|---|---|---|
| `min` (vald) | Varje svagt fält drar ned hela payloaden | Hög |
| `mean` | Stark majoritet kan dölja ett dåligt fält | Medel |
| `weighted mean` | Required-fält kan vägas tyngre | Medel-hög |
| `max` | Bara ett bra fält räcker | Låg — avvisad direkt |

**Vald: min.** Motivering:

1. **Konservativ.** Om ett fält är osäkert, är hela compositionen osäker.
   Klinisk användare ser exakt vilket fält som drog ned aggregatet via
   `fieldEvidence`-listan.
2. **Patient-säker.** False-positive review (osäker mappning märks som
   osäker) är kostnad i klinisk tid; false-negative (osäker mappning
   accepteras) är patient-risk. Min-rule favoriserar kostnaden.
3. **Förutsägbar.** Linjär funktion av minsta värdet — lätt att resonera
   om i debugging och kalibrering.

## 4. Threshold 0.7 — kalibreringspunkt

Default `0.7` är arbiträrt startvärde. Det baseras på:

- LLM-self-reported confidence är dåligt kalibrerad — modeller tenderar
  att överskatta sin säkerhet. 0.7 ger marginal mot detta.
- Empirisk erfarenhet i andra Nimloth-experiment (mapping-assistant
  proposer-flöden) har visat att 0.6-0.8 är realistiska gränspunkter.

**Kalibreras i 4.9** mot eval-set:s `expected_review`-flagga (17 av 50
par har `expected_review: true`). Tröskeln justeras tills
`review_recall` (detected/expected) är hög utan att
`false_positive_review_rate` (oväntade reviews / expected complete) blir
hög.

**Slutliga kalibrerings-data (B22.5.6, 2026-05-10, Anthropic claude-sonnet-4-6
via synthetic-routning):**

| Iteration | Field-accuracy | Review-recall | FPR | Notering |
|---|---:|---:|---:|---|
| 0 (baseline) | 87.4% | 41.2% | 0.0% | Pre-tuning, V1-prompts |
| 1 (prompt-tuning) | 98.6% | 35.3% | 0.0% | parseDosageText/inferStatus/suggestAtc V2 — gav field-accuracy-vinst men review-recall-regression |
| 2 (aggregator-fix) | **98.9%** | **64.7%** | **3.0%** | Aggregator-3-case-distinktion för null-LLM-fält (B22.5.6) |

**Threshold 0.7 behölls** efter iteration. Justeringar gjordes i prompts
+ aggregator, inte i threshold-värdet. Iteration 1:s prompt-tuning
gjorde LLM:n humblare på tvetydig fritext (returnerar `value:null,
confidence:0` istället för att gissa). Iteration 2:s aggregator-fix
säkerställde att sådana null-svar bidrar till min-aggregaten så att
`low_confidence`-trigger fyrar. Tillsammans lyfte review-recall från
41.2% till 64.7% utan att rörda field-accuracy åt fel håll (faktiskt +11.5
punkter förbättring eftersom prompts blev mer disciplinerade).

Kvarvarande gap (64.7% vs ≥95%-mål) är arkitekturisk skuld: 6 av 14
complex-pair triggar inte review trots `expected_review: true`. Dessa
har strukturell ambiguity (multi-dosage, multi-route, status-temporal-
inkonsekvens) som inte fångas av confidence-trigger. Sprint 3-arbete.

Om enskilda fält kräver striktare gränser (t.ex. `doseQuantity` är
säkerhetskritiskt) → se sektion 6.1 (per-fält-trösklar) som post-MVP-
alternativ.

## 5. Conflicting evidence — varför deterministic vinner

När deterministic returnerar `A` med confidence `1.0` och LLM returnerar
`B` med confidence `0.9`, är `A ≠ B`:

- Deterministic är typiskt strukturerad data (FHIR ATC-kod direkt från
  systemet) — strukturerad data är kanonisk.
- LLM tolkar oftast fritext eller härleder från kringliggande information.
- Om de skiljer är det större chans att LLM tolkar fel, eller att källan
  innehåller motsägelser (t.ex. "Warfarin" i display men `B01AC04` i
  ATC-koden — display-text är för Warfarin, koden är för Klopidogrel).

**Default: deterministic vinner i `composition`-output.** Men review
triggas eftersom divergensen kan vara ett tecken på fel i källan, inte
bara en LLM-svaghet.

Detta är revisarbart i 4.9 om kalibrering visar att divergenser oftast
har LLM som rätt sida (osannolikt — strukturerad data är typiskt mer
tillförlitlig).

## 6. Post-MVP-alternativ

### 6.1 — Per-fält-trösklar

Snarare än global threshold `0.7`, ha per-fält-trösklar:

```typescript
const FIELD_THRESHOLDS = {
  doseQuantity: 0.9,   // säkerhetskritiskt
  frequency: 0.8,      // patient-säkerhet
  status: 0.75,
  indication: 0.5,     // dokumentations-värde, inte ordination
};
```

**När införa:** om 4.9 visar att enskilda fält dominerar review-triggering
oproportionerligt. Skjuts till **B22.5-kandidat** om Hemmabasens
prestanda kräver tier-baserad routing.

### 6.2 — Multi-model voting

Anropa två modeller (qwen + deepseek) och kräv konsensus innan acceptans.

- **För:** robustare mot enstaka modell-bias.
- **Emot:** dubbelt så många LLM-anrop, dubbelt så lång latens.

**När införa:** om 4.9 visar att enskilda modeller är systematiskt fel
på vissa fält (t.ex. qwen är sämre på status-inferens). Hör hemma efter
B22.5 om tier-baserad sensitivity införs.

### 6.3 — Active learning

Reviews som accepteras efter human-feedback feedas tillbaka som
fine-tuning-exempel eller few-shot-prompts.

- **För:** systemet förbättras över tid utan modell-byte.
- **Emot:** kräver feedback-loop som P4 inte adresserar (UI för review +
  persistens av decision-rationale + retraining-pipeline).

**När införa:** Sprint 3+ när feedback-pipeline finns.

### 6.4 — Calibration mot historisk data

Periodisk re-kalibrering av threshold och min-rule baserat på faktisk
review-acceptans-rate i produktion.

- **För:** drift-säker — modellförändringar (Ollama-uppgradering, nya
  modell-versioner) kan påverka calibration utan att vi märker det
  manuellt.
- **Emot:** kräver att review-utfall persisteras med strukturerad data
  och periodisk re-kalkyleringskörning.

**När införa:** Sprint 4+ när lakehouse-strukturen finns för
audit-historik. Hör hemma i Nimloth Core operationella spår, inte i
composition-mapper själv.

## 7. Vad detta dokument INTE adresserar

- **UI för human review.** P4 levererar bara `HumanReviewPayload`-formatet.
  Hur kliniker ser och interagerar med payloaden är frontend-arbete
  utanför composition-mapper. Se `Human_Review_Demo_Talking_Points.md`
  för konceptuell beskrivning.
- **Audit-trail för review-beslut.** P4 4.7 emittar `MAPPING_RUN`-event
  vid mapping-tid. Review-acceptans/avvisning från klinisk användare är
  separat audit-event-typ som hör hemma i frontend-flödet.
- **SLA för review-svarstid.** Regional implementations-fråga — beror på
  klinisk arbetsflöde i mottagande system.
- **Eskalationskedjor.** Om kliniker A inte kan besluta, vem är näst i
  linje? Out-of-scope för composition-mapper.

## 8. Sensitivity-tier och cloud-routing — relation till review-pathway (B22.5)

Sedan 2026-05-09 har model-router en sensitivity-tier `synthetic` som
tillåter cloud-routing av syntetisk data (eval-paren, demo-fixtures).
`composition-mapper` läser `NIMLOTH_DATA_MODE`-env vid boot och
propagerar `synthetic` till varje LLM-anrop när env-variabeln är satt.
Default förblir `phi` med hard-locked on-premise-routing.

### 8.1 — Påverkar synthetic-routing review-pathway?

**Nej, inte i logik.** Aggregator-, threshold- och triggers-logiken är
provideroberoende. Confidence-aggregering, conflicting-evidence-
hantering och min-rule fungerar identiskt oavsett om LLM-anropet
gick till `hemmabasen-ollama` eller `anthropic-cloud`.

**Ja, i kalibrering.** Olika modeller har olika confidence-kalibrering
(LLM-self-reported confidence är notoriskt opålitlig och varierar
mellan modell-familjer). Threshold `0.7` som etablerades i 4.9-iteration
mot Anthropic-cloud kanske inte är den rätta tröskeln när
`hemmabasen-ollama` qwen2.5-coder:32b används i produktion. Kalibrerings-
utfall rapporteras därför med modell-kontext:

> **Anthropic claude-sonnet-4-6 (synthetic-mode, B22.5.6, 2026-05-10):**
> review-recall 64.7% / FPR 3.0% / field-accuracy 98.9% vid threshold 0.7.

> **Hemmabasen qwen2.5-coder:32b (phi-mode, väntar på GPU-resurs):**
> mätningar TBD när on-premise-pathway aktiveras (post-P4 / Sprint 3+).

Kalibreringen är inte en fast siffra utan en *funktion av modell*. När
hårdvara levereras körs eval-set:t mot lokal modell och tröskeln
omkalibreras vid behov. Anthropic-utfallet är inte direkt utbytbart
mot lokal modell, men ger en användbar referenspunkt för relativ
positions-känsla.

### 8.2 — Vad om en kliniker frågar "vilken modell körde det här mappnings-fallet?"

`MAPPING_RUN`-event (P4 4.7) inkluderar `providerId` + `modelUsed` +
`dataResidency`. Review-payload har också `fieldEvidence`-listan med
`source`-fält per LLM-fält som identifierar vilken modell som tolkade
fritext. För granskning av enskilt fall kan man alltid se exakt vilken
provider som genererade vilket värde.

### 8.3 — Får review-utfall från `synthetic`-mode användas för PHI-kalibrering?

Med försiktighet. Modell-bias är inte fundamentalt olika mellan
phi-routing och synthetic-routing — det är *samma* modell-mekanismer som
parsar fritext, inferrar status etc. Men om olika modeller används för
olika tier (Anthropic för synthetic, qwen2.5 för phi) är kalibrerings-
utfallen inte direkt utbytbara. Det är en strukturell skillnad, inte
en sensitivity-skillnad.

I praktiken: 4.9-iteration mot Anthropic ger oss en hyfsad första
calibration. Post-P4 omkörning mot riktig on-premise-modell justerar
om det behövs. Båda är legitima datapunkter — bara med olika modell-
kontext.

## 9. Referenser

- `nimloth-docs/P4_Composition_Mapper.md` sektion 4.6 + 4.6b (spec)
- `services/composition-mapper/src/mapping/aggregator.ts` (implementation)
- `services/composition-mapper/src/types/review.ts` (typedefinitioner)
- `services/composition-mapper/eval-set/README.md` (triggervillkors-exempel)
- `nimloth-docs/Strategi_Nasta_Steg.md` (B19-leverans, B22.5-kandidat)
- `nimloth-docs/B22.5_Tier_Based_Sensitivity_Strategy.md` (sensitivity-tier-strategi)
- `docs/operations/Demo_Mode_Configuration.md` (operationell ref)
- `docs/operations/Human_Review_Demo_Talking_Points.md` (demo-stöd)

## 10. Revisionslogg

| Version | Datum | Ändring |
|---|---|---|
| v1 | 2026-05-08 | Initial leverans (P4 4.6b). Threshold 0.7 är default; kalibreras i 4.9. Sektion 4 har TODO för kalibrerings-utfall. |
| v1.1 | 2026-05-09 | Lagt till §8 om synthetic-tier och dess påverkan på kalibrering. Renumrerat Referenser → §9, Revisionslogg → §10. |
| v1.2 | 2026-05-10 | Fyllt i §4 med slutlig kalibrerings-data från B22.5.6 (Anthropic claude-sonnet-4-6 synthetic-routning): 98.9% field-accuracy, 64.7% review-recall, 3.0% FPR, threshold behållen vid 0.7. Uppdaterat §8.1 med Anthropic-utfall + TBD-platshållare för on-premise omkörning. |
