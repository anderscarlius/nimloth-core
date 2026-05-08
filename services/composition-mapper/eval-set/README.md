# composition-mapper eval-set

50 manuellt skrivna FHIR R4 → openEHR `medication_summary.v1`-par enligt
Alt A2-fördelning (P4 spec sektion 0.0 Q-A, Anders 2026-05-07).

## Distribution

| Komplexitet | Filer | Antal | Karaktär |
|---|---|---:|---|
| `simple` | `med-001.json` … `med-012.json` | 12 | Clean ATC, strukturerad dosage, alla deterministiska fält ifyllda |
| `moderate` | `med-013.json` … `med-035.json` | 23 | Free-text dosage som kräver parsing, eller saknade optional fält |
| `complex` | `med-036.json` … `med-050.json` | 15 | Tvetydig status, motstridiga fält, eller saknad required-data → `expected_review: true` |

Total: 50 par.

## Format per par

```json
{
  "id": "med-001",
  "metadata": {
    "complexity": "simple|moderate|complex",
    "expected_review": false,
    "notes": "kort beskrivning av paret"
  },
  "input_fhir": { /* FHIR R4 MedicationStatement (full resurs) */ },
  "expected_fields": {
    "medicationName": { "value": { "name": "...", "code": "...", "system": "..." } } | null,
    "status": { "value": "active|completed|abandoned|suspended|planned" } | null,
    "startTime": { "value": "ISO-8601" } | null,
    "route": { "value": { "value": "...", "terminology": "...", "code": "..." } } | null,
    "sequence": { "value": 1 } | null,
    "subject": { "value": { "namespace": "patient", "type": "PERSON", "id": "..." } } | null,
    "doseQuantity": { "value": { "value": 2.5, "unit": "mg" } } | null,
    "frequency": { "value": "DAILY|BID|TID|QID|PRN|..." } | null,
    "indication": { "value": "..." } | null
  }
}
```

`null`-värden i `expected_fields` markerar fält där composition-mapper INTE
ska kunna producera deterministisk output. För `expected_review: true`-par
betyder det att aggregator-output ska bli `human-review-required`.

## Format-beslut (Del 0-recce 2026-05-07)

P4-spec sektion 4.4 stipulerar `expected_composition` som "openEHR
medication_summary.v1 composition" (full canonical JSON). Vi avviker till
**`expected_fields`** — flat key-value-projektion som matchar
composition-mapper:s output-API (`MappedField<T>` per fält).

**Motivering:**

1. Composition-mapper:s output är fält-orienterad (`MappedField<T>`-per-fält
   via `applyDeterministicMappings` + 4.5/4.6 LLM-aggregator). Eval-runner
   i 4.8 mäter `field_accuracy` — direkt matchning fält-för-fält.
2. Full canonical openEHR JSON skulle vara redundant och föra in
   wrap-strukturer (`_type`, `archetype_details`, `language`, `territory`,
   `composer`, `context`) som inte är meningsfulla för mappnings-eval.
3. Designvalet kan revideras i 4.12 utan kostsam migration — eval-runner
   tolkar formatet, inte FHIR-input-sidan.

`indication` och `frequency` i `expected_fields` är LLM-fält som planeras
i 4.5. För simple/moderate par fyller vi i förväntade värden så att
eval-runner kan validera dem när 4.5 är klar; för complex-par lämnas
de som null när `expected_review: true`.

## Strukturella fynd från Del 0

### Template-status: minimal fixture-pivot

`infra/openehr/templates/medication_summary.v1.opt.xml` är resultatet av
P3.0b Del 1 Path C — sed-transform av `minimal_evaluation.opt`. Templaten
är medvetet **minimal**: COMPOSITION → EVALUATION (`openEHR-EHR-EVALUATION.medication_summary.v1`)
→ ITEM_TREE (`at0001`) → ELEMENT (`at0002`) → DV_QUANTITY (units: kg, mg, gm).

Inga fält för `medication_name`, `status`, `route`, `dosage_text` etc i
**templaten** — de finns däremot i den **fullständiga CKM-arketypen**
(`infra/openehr/archetypes/openEHR-EHR-EVALUATION.medication_summary.v1.adl`,
817 rader) som har at0002 medication name, at0008 episode-cluster med
dose/route/onset/cessation/intent, at0009/at0010 onset/cessation, etc.

### Risk för P4 4.10 live-EHRbase-validering (AC6)

Composition-mapper:s output (vad eval-set:s `expected_fields` reflekterar)
matchar **CKM-arketypen**, inte den deployerade pivot-templaten.
4.10-integration-testet (`POST /composition` → 201 mot live EHRbase) kommer
**inte** att passera så länge templaten är minimal-pivot — EHRbase avvisar
fält som saknar plats i template-OPT.

**Tre möjliga vägar (Anders-beslut innan 4.10 påbörjas):**

1. **Utvidga templaten** — generisk ADL→OPT-bridge (B12-territorium per
   `infra/openehr/templates/PROVENANCE.md`). Stort scope.
2. **Begränsa composition-mapper:s output** till bara DV_QUANTITY (dose).
   Gör eval-set och 4.8/4.9 trivialt — bara dosering testas. Förlorar
   nästan all hybrid-arkitekturs nytta.
3. **Skip live-EHRbase i 4.10** för P4. Composition-mapper:s output
   verifieras strukturellt i 4.8 eval-runner men live-validering deferreras
   till P5/P6 när template-utvidgning är klar.

Förslag (för Anders-granskning): **Väg 3** — flagga AC6 som "deferred".
Field-accuracy mot eval-set:s `expected_fields` är meningsfull mätsignal
för P4. Live-EHRbase är en separat infrastrukturell milstolpe som kräver
B12-arbete.

### openehr-composer producerar inga medication-compositions ännu

`services/openehr-composer/src/event-mapper.ts` har
`core.clinical.medication.{prescribed,dispensed}` som GAP. P3.0b Del 2
(composer composition-builder-utvidgning) är pausad enligt
`Strategi_Nasta_Steg.md`. Vår expected_fields-projektion behöver alltså
inte matcha någon befintlig composer-output.

## Drug-spridning (simple par)

Minst 8 av dessa representeras i 12 simple par:

| Drug | ATC | Klass |
|---|---|---|
| Waran | B01AA03 | Antikoagulation |
| Metoprolol | C07AB02 | Beta-blockerare |
| Paracetamol | N02BE01 | Analgetika |
| Furosemid | C03CA01 | Diuretika |
| Simvastatin | C10AA01 | Statin |
| Levaxin (levothyroxine) | H03AA01 | Sköldkörtel |
| Citalopram | N06AB04 | SSRI |
| Omeprazol | A02BC01 | PPI |
| Amoxicillin | J01CA04 | Antibiotika |
| Insulin glargin | A10AE04 | Diabetes |

## Coverage-matriser (genererat 2026-05-08)

### ATC-klass coverage (3-tecken-prefix)

22 distinkta ATC-prefix representerade (≥8 minimum-krav uppfyllt):

| Prefix | Antal | Klass |
|---|---:|---|
| A02 | 3 | PPI / antacida |
| A10 | 2 | Diabetesläkemedel |
| A11 | 1 | Vitamin D |
| B01 | 8 | Antikoagulantia / antiplatelet |
| B03 | 2 | Folsyra / B12 |
| C01 | 1 | Hjärtglykosider (digoxin) |
| C03 | 3 | Diuretika |
| C07 | 3 | Beta-blockerare |
| C09 | 3 | ACE-hämmare / ARB |
| C10 | 3 | Statiner |
| D07 | 2 | Topikala kortikosteroider |
| H02 | 2 | Systemkortikosteroider |
| H03 | 1 | Sköldkörtelhormon |
| J01 | 4 | Antibiotika |
| L04 | 1 | Immunsuppressiva |
| LOC | 1 | Lokalt formularium (test) |
| M05 | 1 | Bisfosfonater |
| N02 | 5 | Analgetika |
| N05 | 1 | Anxiolytika |
| N06 | 1 | SSRI |
| R03 | 1 | Bronkdilatatorer |
| UNK | 1 | UNKNOWN-placeholder (test) |

### FHIR-status coverage

Alla 8 FHIR R4-enum-värden representerade:

| Status | Antal | Mappas-till (4.3) |
|---|---:|---|
| `active` | 37 | `active` |
| `completed` | 3 | `completed` |
| `entered-in-error` | 3 | `null` (kräver review) |
| `intended` | 1 | `planned` |
| `not-taken` | 2 | `null` (kontextuellt) |
| `on-hold` | 1 | `suspended` |
| `stopped` | 1 | `abandoned` |
| `unknown` | 2 | `null` (per definition) |

### Route coverage

6 distinkta SNOMED-koder + 6 par utan route (≥3 olika minimum-krav uppfyllt):

| Route-kod | Antal | Display |
|---|---:|---|
| 26643006 | 37 | Oral |
| 34206005 | 3 | Subcutaneous |
| (saknad) | 6 | — |
| 18679011 | 1 | Inhalation |
| 47625008 | 1 | Intravenous |
| 6064005 | 1 | Topical |
| 78421000 | 1 | Intramuscular |

## Verifiering

Strukturell Zod-validering av alla 50 `input_fhir`:

```bash
pnpm --filter @nimloth-core/composition-mapper exec tsx scripts/validate-eval-set.ts
```

Förväntat: `50 files validated, 0 failures`.

## Review-checklista (post-session, Anders)

För ~5 random-utvalda par i varje kategori:

- [ ] **Klinisk realism:** läkemedel + dos + frekvens är medicinskt rimliga
- [ ] **ATC-koder korrekta** (SNOMED CT-koder för route också, om använda)
- [ ] **`expected_fields` matchar deterministisk-mapparens förväntade output**
- [ ] **Status-mappning** stämmer med 4.3-deterministisk-logiken (5 av 8 → openEHR-värde, 3 → null)
- [ ] **Free-text dosage** i moderate-par är realistiska svenska formuleringar
- [ ] **Complex-par** har faktiskt motiverad `expected_review: true`
- [ ] **Format-beslut godkänt:** `expected_fields` (flat) istället för full canonical composition

Eventuella avvikelser → B17.1-fix-item.
