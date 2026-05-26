# SDG-09 Demo Roster — namngivna ankarpersoner i CDR:n

**Status:** Klar 2026-05-26.
**Scope:** Kurerat set patienter med bestämda berättelser som lever i EHRbase
och kan navigeras till live i Sprint 2-demon. Varje ankare har ett uttalat
demo-syfte och fångas av en specifik AQL-fråga från SDG-08.

---

## Kanonisk identitet — Ingrid Andersson

**Sanningskälla:** `ingrid-andersson-syn-001`.
Tidigare också refererad som "Fru Andersson" (scenario-generic), "Margit
Andersson" (vissa seed-script) och "Ingrid Andersson" (hifi-design).
Per SCENARIO.md är förnamnet kosmetiskt; personnumret **19500315-2384**
är auktoritativt. **SDG-09 fastställer "Ingrid" som det kanoniska
förnamnet.** De 41 filer i core som blandar former rörs INTE i denna
del — den separata städpatchen ska använda denna rad som sin
sanningskälla.

---

## Roster (5 ankarpersoner)

| Namn | Ålder | EHR-id | Profil | Seed | Comps | AQL | Demo-poäng |
|---|---:|---|---|---:|---:|---|---|
| **Ingrid Andersson** | 74 | `0e0c3af2-1e49-4ede-b861-05baca570f53` | bespoke (Sprint 2 scenario) | 1503 | 16 | AQL-12 | Sprint 2 huvudscenario: multi-morbid, höftprotes + postop DVT, akut allergi+antikoagulation-svar krävs |
| **Anders Bergström** | 58 | `f5054071-ffd4-442e-bb16-1e0d829f9373` | bespoke (AQL-06 dropout) | 1958 | 5 | **AQL-06** | Diabetes diagnostiserad + metformin insatt — patienten försvinner från uppföljning. Lost-to-followup. |
| **Karin Eriksson** | 72 | `327a3d32-33bd-475d-be3f-8217d8872a73` | bespoke (AQL-09 recurrence) | 1972 | 7 | **AQL-09** | Recidiverande UVI, 5 vårdcentralsbesök på 70 dygn. ESBL-misstanke, urolog-remiss aktuell. |
| **Lars Johansson** | 64 | `d415fde8-979a-4c7a-8d4c-14ab7c78f8c1` | bespoke (AQL-10 responder) | 1964 | 6 | **AQL-10** | Nydiagnostiserad T2D (HbA1c 82). Metformin + livsstil → HbA1c 58 efter 4 mån. Klassisk responder. |
| **Eva Lindgren** | 71 | `fdb0d573-3363-4635-bbe0-c12f520ed85c` | bespoke (AQL-14 non-responder) | 1971 | 6 | **AQL-14** | T2D (HbA1c 82). Metformin insatt men HbA1c stiger till 88 efter 4 mån. SGLT2-tillägg aktuellt. |

**Total:** 5 patienter, 40 compositions. Loadning verifierad 2026-05-26
mot `http://192.168.1.189:11401/ehrbase`.

---

## Reachability-bevis

Per ankare bekräftades att respektive AQL-fråga **faktiskt fångar ankaret**
i sin träffmängd (inte bara `>0` i populationen som helhet):

| AQL-fråga | Verifierad fångst | Träff-set inkluderar |
|---|---|---|
| AQL-06 | ✓ | Anders Bergströms ehr (diabetes-diagnos utan uppföljande HBA1C) |
| AQL-09 | ✓ | Karin Erikssons ehr (5 primary_care_encounter inom rullande 90-dygnsfönster) |
| AQL-10 | ✓ | Lars Johanssons ehr (HBA1C 82 → 58 efter medication_statement) |
| AQL-14 | ✓ | Eva Lindgrens ehr (HBA1C 82 → 88 efter medication_statement) |
| AQL-12 | ✓ | Ingrid Anderssons ehr (16 kronologiska compositions) |

Verifierat via `src/scripts/sdg09-anchors.ts`:s reachability-step efter
laddning. Resultat sparat i `data/sdg09_anchors_result.json`.

---

## Ingrid Andersson — kanonisk tidslinje

16 compositions över perioden 2024-11-15 → 2025-10-15:

| # | Datum | Event-typ | Innehåll (composer.name-utdrag) |
|---|---|---|---|
| I01 | 2024-11-15 | primary_care_encounter | Närhälsan VC Centrum årskontroll |
| I02 | 2024-11-15 | vital_signs | systolic 142 mm[Hg], puls 74, vikt 76 kg |
| I03 | 2024-11-15 | lab_result | HBA1C 54 mmol/mol (välbehandlad T2D) |
| I04 | 2024-11-15 | medication_statement | A10BA02 Metformin 500 mg × 2 |
| I05 | 2024-11-15 | medication_statement | C10AA01 Simvastatin 20 mg × 1 |
| I06 | 2024-11-15 | medication_statement | A02BC01 Omeprazol 20 mg × 1 |
| I07 | 2025-02-20 | problem_diagnosis | M16.1 koxartros höger grad 3 |
| I08 | 2025-02-20 | referral | SU Mölndal ortopedmott |
| I09 | 2025-03-15 | specialist_consultation | KVÅ NFB49 höftprotes, Zimmer Avenir Complete |
| I10 | 2025-03-18 | problem_diagnosis | I82.4 postoperativ DVT |
| I11 | 2025-03-18 | medication_statement | B01AA03 Warfarin 2.5 mg × 1 |
| I12 | 2025-03-20 | lab_result | INR 2.8 |
| I13 | 2025-03-25 | care_plan | Waran ≥ 35 d post-op, INR-kontroller 2-3 v |
| I14 | 2025-05-05 | specialist_consultation | ortoped_followup, gångförmåga 200 m |
| I15 | 2025-10-15 | primary_care_encounter | årskontroll diabetes + antikoagulation |
| I16 | 2025-10-15 | lab_result | HBA1C 52 mmol/mol (stabil T2D) |

**Penicillinallergi** (urtikaria, måttlig, Melior SU) bärs som annotation i
medication_statement-context — fixture-shapes saknar dedikerad allergi-shape
trots P3.0d-templatens existens (composer-byte är SDG-10-scope, S2 respekteras).

---

## Användning i demo

```bash
# Mariannes journal (befintlig, från sdg07)
pnpm demo:aql --id AQL-12

# Anders Bergström — dropout
pnpm demo:aql --id AQL-06   # Anders finns i träffmängden

# Karin Eriksson — recurrence
pnpm demo:aql --id AQL-09   # Karin finns med

# Lars Johansson — responder
pnpm demo:aql --id AQL-10

# Eva Lindgren — non-responder
pnpm demo:aql --id AQL-14

# Ingrid Andersson — Sprint 2-scenariot (direkt AQL)
curl -s -X POST http://192.168.1.189:11401/ehrbase/rest/openehr/v1/query/aql \
  -H "Content-Type: application/json" \
  -d "{\"q\":\"SELECT c/uid/value, c/composer/name, c/context/start_time/value
        FROM EHR e
        CONTAINS COMPOSITION c
        WHERE e/ehr_status/subject/external_ref/id/value = 'ingrid-andersson-syn-001'
        ORDER BY c/context/start_time/value\"}" | jq .
```

---

## Säkerhetsventiler

| | Status |
|---|---|
| **S1** Determinism | ✅ baseline.characterization.test.ts 2/2 grön efter laddning. Ankare har fasta seeds (1503, 1958, 1972, 1964, 1971) — samma seed → samma ankare. |
| **S2** Composer-/OPT-lagret orört | ✅ Ankarna använder samma 3 fixture-shapes som resten (`buildTimeSeries`/`buildMinimalAction`/`buildMinimalEvaluation`). OPT-byte = SDG-10. |
| **S3** Avstämning, inte motsägelse | ✅ Ingrids tidslinje följer SCENARIO.md (datum, koder, implantatdetaljer, INR-trend). Bespoke-väg vald för att respektera detalj-precisionen. |
| **S4** Kanoniskt namn etableras, ingen mass-rename | ✅ `ingrid-andersson-syn-001` skapad. 41 filer i core med Fru/Ingrid-inkonsistens rörda INTE — separat städpatch dokumenterad ovan. |
| **S5** Laddning tillåten | ✅ Via direkt EHRbase HTTP-POST (samma path som sdg07-scale + sdg02-ingrid). Inga template-/schemaändringar. |

---

## Population totalt efter Del 2

| | Antal |
|---|---:|
| Tidigare (Del 1 population) | 1001 EHR / 10 066 comp |
| Del 2 ankare | +5 EHR / +40 comp |
| **Total** | **1006 EHR / 10 106 comp** |
