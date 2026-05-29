# Demo-underlag — AI-medicineringsgenomgång (Fas 3 / Fork 4)

**Status:** Demo-underlag, grundat i LIVE-körningar mot cf4 2026-05-28.
**Demo-yta:** `/med-review` i dashboard (proxar SSE → `med-review-core` på cf4:11403).
**Publik:** VGR/Skåne ledning + klinisk informatik + arkitekter (mixad strategisk/teknisk).
**Komplement:** [`med-review`-service-kod](../../services/med-review/) · memory: [`project_med-review-fas3.md`](../../memory/project_med-review-fas3.md)

> Allt nedan är **fångat från faktiska live-körningar** mot den co-lokaliserade
> deployen (Opus 4.7-syntes), inte ur minnet. Verbatim-narrativ, exakta fynd,
> exakta audit-events och faktiska timings.

---

## 1. De två demo-patienterna (live-fångat)

### 1.1 Ingrid Andersson (74) — kontraindikations-beaten (huvudnummer)

**Klinisk bild (kolumn 1, live):**
- **Läkemedel (5):** Metformin 500 mg x 2 (T2D, sedan 2018, A10BA02) · Simvastatin 20 mg (C10AA01) · Omeprazol 20 mg (A02BC01) · Warfarin (Waran) 2.5 mg (B01AA03) · **Amoxicillin 500 mg x 3 (UVI, nyinsatt, J01CA04)**
- **Diagnoser (2):** Primär koxartros höger, röntgen grad 3 (M16.1) · Postoperativ djup ventrombos, v. femoralis (I82.4)
- **HbA1c-trend (2):** 54 → 52 mmol/mol (välbehandlad T2D)
- **Allergier (1):** **Penicillin (J01CE), kritikalitet high, reaktionstyp allergy**

**Fynd (4, deterministiska regelmotorn — exakt severity + citering):**

| # | Severity | Typ | Fynd | Källa |
|---|---|---|---|---|
| 1 | **HÖG** | kontraindikation | **Penicillinallergi + aktiv Amoxicillin — DIREKT KONTRAINDIKATION** (J01CE + J01CA04, samma klass J01C*, ingen cross-reactivity-bedömning behövs, anafylaxirisk) | StatPearls NBK482250 |
| 2 | Måttlig | interaktion | Warfarin + Amoxicillin — INR-stegring (stör vitamin-K-flora, ej CYP450, fördröjd effekt) | PMC10455514, Davydov 2003, patient.info |
| 3 | Måttlig | beers_stopp | Warfarin hos äldre — blödningsrisk + INR-labilitet | Beers 2023 (AGS), doi:10.1111/jgs.18372 |
| 4 | Låg | beers_stopp | PPI i full dos — ompröva vid >8 v | STOPP/START v3, doi:10.1007/s41999-023-00777-y |

**Narrativ (ordagrant, Opus 4.7, source=llm, S1-validerad):**

> **Sammanfattning – Ingrid Andersson**
>
> Patienten har 5 aktiva läkemedel och 2 diagnoser. Genomgången identifierade fyra fynd, samtliga med angiven källa:
>
> - **[Hög] Kontraindikation:** Dokumenterad penicillinallergi samtidigt med nyinsatt Amoxicillin 500 mg x 3 (UVI). Amoxicillin (J01CA04) tillhör penicillinklassen (J01C*) — samma läkemedelsklass, ingen cross-reactivity-bedömning behövs. Risk för anafylaxi vid återexponering. (Källa: StatPearls)
> - **[Måttlig] Interaktion:** Warfarin + Amoxicillin kan ge INR-stegring. Mekanismen är påverkan på vitamin-K-producerande tarmflora (ej CYP450), och effekten kan vara fördröjd dagar in i eller efter kuren. Förhöjd blödningsrisk, mer uttalad hos äldre och njurnedsatta. (Källor: narrativ review, fallrapport, patient.info)
> - **[Måttlig] Beers/STOPP:** Warfarin hos äldre – smalt terapeutiskt fönster och INR-labilitet som ökar med ålder, interaktioner och njurfunktion. Beers listar antikoagulantia bland läkemedel som kräver särskild försiktighet/övervakning. (Källa: Beers 2023, AGS)
> - **[Låg] Beers/STOPP:** PPI i full dos bortom 8 veckor utan kvarstående indikation, med associerad frakturrisk samt B12-/magnesiumbrist vid långtidsbruk. STOPP markerar detta som punkt för omprövning. (Källa: STOPP/START v3)
>
> Demonstration — ej medicinteknisk produkt, ej beslutsstöd.

**Audit (4 dataaccesser, PDL-spårbarhet):** active_medications (5 rader, 41ms) · active_diagnoses (2, 41ms) · observation_trend_by_period (2, 68ms) · documented_allergies (1, 88ms). **Total: 10 622 ms.**

> **Varför detta är huvudnumret:** kontraindikationen resoneras från *registrerad
> reaktionstyp + läkemedelsKLASS* (J01C*), inte naken sträng-match. Det är ett
> kliniskt farligt fel (nyinsatt penicillin till penicillinallergiker) som en
> genomgång ska fånga — och den fångas deterministiskt, med källa.

### 1.2 Marianne Lindqvist (81) — interaktion + Beers/STOPP-beaten

**Klinisk bild (kolumn 1, live):**
- **Läkemedel (8):** metoprolol (C07AB02) · atorvastatin (C10AA05) · allopurinol (M04AA01) · **sertraline 50-100 mg (N06AB06)** · **warfarin individuell (B01AA03)** · amlodipine (C08CA01) · ramipril (C09AA05)
- **Diagnoser (6):** Förmaksflimmer (I48) · Hyperlipidemi (E78) · Gikt (M10) · Depressiv episod (F32) · Essentiell hypertoni (I10) · *[aldre_multisjuk — profil-tagg, se §10]*
- **HbA1c-trend:** 0 (ej diabetiker) · **Allergier:** 0

**Fynd (3, exakt severity + citering):**

| # | Severity | Typ | Fynd | Källa |
|---|---|---|---|---|
| 1 | **HÖG** | interaktion | **Warfarin + SSRI (sertralin) — ökad blödningsrisk** (trombocyt-serotonin, additivt till antikoagulation, PT +5–8%) | Pharmacy Times, PMC3123326, PMC7239828 |
| 2 | Måttlig | beers_stopp | Warfarin hos äldre — blödningsrisk + INR-labilitet | Beers 2023 (AGS), doi:10.1111/jgs.18372 |
| 3 | Måttlig | beers_stopp | SSRI hos äldre — hyponatremi- och fallrisk | STOPP/START v3, doi:10.1007/s41999-023-00777-y |

**Narrativ (ordagrant, Opus 4.7, source=llm, S1-validerad):**

> **Sammanfattning – Marianne Lindqvist (8 läkemedel, 6 diagnoser)**
>
> Tre fynd har identifierats av regelmotorn, samtliga med angivna källor:
>
> - **[Hög] Interaktion warfarin + SSRI (sertralin):** Ökad blödningsrisk, särskilt gastrointestinal. Mekanismen är farmakodynamisk – SSRI hämmar serotoninupptag i trombocyter vilket försämrar trombocytaggregationen additivt till warfarins antikoagulation. Sertralin har rapporterats förlänga protrombintiden med cirka 5–8 %. Fall-kontrollstudier visar förhöjd odds för inläggning på grund av GI-blödning vid SSRI-insättning hos warfarinpatienter. (Källor: Pharmacy Times, fall-kontrollstudie, svensk registerstudie)
> - **[Måttlig] Warfarin hos äldre (Beers/STOPP):** Förhöjd blödningsrisk och INR-labilitet. Warfarin är en vitamin-K-antagonist med smalt terapeutiskt fönster, och INR-labilitet ökar med ålder, läkemedelsinteraktioner och njurfunktion. Beers listar antikoagulantia bland läkemedel som kräver särskild försiktighet och övervakning. (Källa: Beers 2023, AGS)
> - **[Måttlig] SSRI hos äldre (Beers/STOPP):** Risk för hyponatremi (SIADH), yrsel och fall. Vid samtidig antikoagulation tillkommer additiv blödningsrisk (se separat interaktionsfynd). STOPP flaggar SSRI vid samtidig hyponatremi-risk eller blödningsbenägenhet. (Källa: STOPP/START v3)
>
> Demonstration — ej medicinteknisk produkt, ej beslutsstöd.

**Audit (4 dataaccesser):** active_medications (8, 40ms) · active_diagnoses (6, 52ms) · observation_trend_by_period (0, 62ms) · documented_allergies (0, 82ms). **Total: 8 798 ms.**

---

## 2. UI-flödet (tre kolumner, streaming)

`/med-review` — egen full-höjd-vy. Patient-väljare (6 ankarpersoner) + "Starta genomgång".

| Kolumn | Innehåll | Strömningsordning |
|---|---|---|
| **1 — Patientdata** | Mediciner → Diagnoser → HbA1c-trend → Allergier | Fylls **stegvis** (en panel i taget, audit-beat per steg) |
| **2 — Fynd + narrativ** | Severity-färgade fynd (high→low) + sammanfattning | Fynd dyker upp efter regelkörning; narrativet ackumuleras **token-för-token** live |
| **3 — Audit-tidslinje** | Ett spår per dataaccess (mall · radantal · ms · tid) + klar-summering | En post per AQL-anrop, PDL-spårbarhet |

**Strömningssekvens (steg-strip överst):** ✓ Hämtar aktiva läkemedel → ✓ diagnoser → ✓ HbA1c-trend → ✓ allergier → ✓ Kör regelmotorer → ✓ Claude-syntes (S1-validerad). Header bär gul badge: *"Demonstration — ej medicinteknisk produkt, ej beslutsstöd · syntetisk data"*. Vid godkänd syntes: *"Claude-syntes (S1-validerad)"*; vid avvisning: rosa banner + deterministisk fallback.

---

## 3. Latensprofil (faktiska siffror)

| Mätning | Ingrid | Marianne |
|---|---:|---:|
| Stegad datahämtning (4 AQL, co-located loopback) | ~234 ms | ~233 ms |
| Per query | 41/41/68/88 ms | 40/52/62/82 ms |
| **Total väggklocka (inkl. Claude-syntes)** | **10 622 ms** | **8 798 ms** |
| LLM-syntes-andel | ~97% | ~97% |

**Poäng:** datalagret är trivialt (~0,23s för 4 sekventiella AQL-frågor mot EHRbase
över docker-loopback). Väggklockan ÄR LLM:en (~8,5–13s, varierar med Claude-last).
Detta bekräftar **AC1-falsifieringen**: co-location löste *inte* latensen — topologi
var aldrig flaskhalsen. Spaken är **bounded/stegad hämtning** (sekventiellt, ej
wide fan-out mot en 4-kärnig single-node-EHRbase).

---

## 4. Arkitektur / S1-ryggraden

**One-liner:** *"AI:n skriver prosan; varje kliniskt beslut fattas — och valideras — av deterministiska regelmotorer mot publicerade kriterier med källa. LLM:en är aldrig i beslutsvägen."*

- **Deterministisk klinisk bedömning (S1-ryggrad):** `runRules` — interaktions-/kontraindikations-checker + Beers/STOPP-checker. Rena funktioner, inget LLM. Fynd är **deskriptiva, aldrig imperativa** (håller demon utanför MDR Rule 11 / EU AI Act high-risk).
- **Validerad LLM-syntes:** Claude omformulerar fynden → narrativet **valideras maskinellt mot fynden** (synthesis-validator): beslutsspråk i LLM:ens röst (gated av korpus-subtraktion) + ogrundad motor-känd läkemedelsreferens → avvisning + deterministisk fallback, synligt flaggat.
- **Audit:** ett spår per dataaccess (PDL). Stegad hämtning = bounded concurrency = streaming-UX = audit-beats — **EN mekanism**.
- **Verifierat per körning:** `source=llm` + "S1-validerad" syns i UI:t; en avvisning byter synligt till deterministisk text.

---

## 5. Haiku-fallback-beaten (Obs 2) — LIVE-testresultat

**Test:** flippade `MED_REVIEW_SYNTH_MODEL=claude-haiku-4-5` på cf4 (env-override, ej `.env`-edit), körde båda patienterna 3× var, återställde Opus efteråt (verifierat tillbaka på `claude-opus-4-7`).

| Modell | Ingrid | Marianne |
|---|---|---|
| **Opus 4.7** (baseline) | 0 avvisningar | 0 avvisningar (källförankrad output passerar) |
| **Haiku 4.5** | 0/3 avvisade | **2/3 avvisade** — validatorn fångade `"sätts in"` (beslutsspråk, saknar motsvarighet i fynden) → deterministisk fallback |

**Slutsats (ärlig):** beaten är **äkta men stokastisk**. Haiku driver in catchbart
beslutsspråk på Marianne ~2 av 3 körningar, men inte alls på Ingrid i detta urval.
Validatorn fungerar korrekt varje gång den triggas — men en svagare modell triggar
den inte *tillförlitligt på kommando*.

**Rekommendation för en pålitlig live-demo:** förlita dig INTE på Haikus slump.
Antingen (a) **deterministisk debug-inject** — en demo-flagga som matar in ett
känt osourcerat påstående ("Överväg att sänka warfarindosen") så bannern slår till
på kommando, varje gång; eller (b) **förinspela** en avvisad Haiku-Marianne-körning.
Validatorn är bevisat korrekt (8 enhetstester + live 2/3); det är *demo-reproducerbarheten*
som kräver en deterministisk trigger. (Debug-inject är ~liten kod; ej byggd än.)

---

## 6. Ärlighets-gränser (talspunkter — Obs 1 + S2)

Den som visar demon **måste** hävda gränsen rakt — annars blir det ett överpåstående
av exakt den sort programmet undvikit:

- **"Varje kliniskt *beslut* fångas deterministiskt — inte varje *påstående* valideras."** Validatorn är försvar-på-djupet (beslutsspråk + sluten-världs-läkemedelskontroll), inte ett semantiskt bevis. Säg det.
- **Ej medicinteknisk produkt, ej beslutsstöd.** Syns i header + varje syntes-svans.
- **Syntetisk data** (1005 EHR, SDG-genererad).
- **Beers/STOPP exakta kriterie-ID:n utestående** — demon skeppas med primärkälla + sektion + DOI (Beers 2023 doi:10.1111/jgs.18372; STOPP/START v3 doi:10.1007/s41999-023-00777-y). De alfanumeriska kriterie-ID:na byts in när primärtabellerna är i hand — de gissas inte.
- **Subtilt (om en arkitekt frågar):** narrativet återger bara *fynden*, inte hela läkemedelslistan. Marianne står t.ex. på metoprolol/amlodipin/ramipril utan motsvarande fynd — de syns i kolumn 1 (Patientdata) men nämns medvetet inte i sammanfattningen. Skulle LLM:en dra in ett icke-fynd-läkemedel som påstående fångar validatorn det. Det är önskat S1-beteende, inte en lucka.

---

## 7. Tes-koppling (boken)

Demon bevisar bokens tes — *plattform = AI-beredskap*:

- **Datalager som gravitationscentrum:** AI-genomgången blev möjlig först när det fanns ett semantiskt strukturerat openEHR-lager att fråga (SDG äkta domän-OPTs → AQL-mallar → agent). Utan substratet ingen pålitlig klinisk AI.
- **openEHR semantisk interop som förutsättning:** regelmotorn resonerar på ATC/ICD/arketyp-nivå, inte på fritext — det är vad strukturen köper.
- **Plattformsinvestering = AI-readiness (DORA):** samma poäng som DORA gör empiriskt — mogen plattform är förutsättningen, inte AI-modellen i sig.
- **AI som driftstillgång, inte driftrisk:** S1-ryggraden + den validerade syntesen är själva argumentet — LLM får skriva prosan, men kan strukturellt inte fatta ett osourcerat kliniskt beslut. Det är skillnaden mellan demobar AI och deploybar AI i vården.

Tonläge: HBR-möter-IEEE-Spectrum — strategiskt *varför* + tekniskt *hur*, samma material för båda.

---

## 8. Publik + register

- **Publik:** VGR/Skåne ledning + klinisk informatik + arkitekter. Mixad strategisk/teknisk.
- **Register-växling:**
  - *Ledning:* §7 (tes) + §1.1 (kontraindikationen som "farligt fel som fångas") + §4 one-liner.
  - *Klinisk informatik:* §1 fynd + källor, §6 ärlighets-gränser (de testar överpåståenden).
  - *Arkitekter:* §3 latens, §4 S1-mekanik, §5 Haiku-beat, §10 öppna punkter.

---

## 9. Tillgångar + access

- **Demo-yta:** dashboard `/med-review` (kör vite-dashboard lokalt; proxar SSE → cf4:11403). Compose-sandlåda: `/compose-demo`.
- **Direkt SSE (utan UI):** `GET http://192.168.1.189:11403/api/med-review/<patientId>/stream?age=<n>` — patientId t.ex. `ingrid-andersson-syn-001` (74), `marianne-lindqvist-syn-001` (81).
- **Access:** **INTERN ONLY** (LAN 192.168.1.189 eller SSH-port-forward). Ingen publik tunnel — mock-auth gatekeepar (se §10). För publik video: SSH-port-forward så intern IP ej syns (jfr [`Demo_Runbook.md`](Demo_Runbook.md) §2.2).
- **Skärmbilder:** ⚠️ **att återfånga** — tidigare Preview-skärmbilder sparades inte till disk. Kör en genomgång i dashboard och fånga tre-kolumns-vyn (Ingrid + Marianne) före demo. Lägg i `docs/operations/demo-assets/` (skapas vid capture).
- **Verbatim-data:** detta dokument (§1) är den auktoritativa fångsten 2026-05-28.

---

## 10. Öppna punkter som påverkar demon

| Punkt | Påverkan på demon | Status |
|---|---|---|
| **mock-auth** | Gatekeepar **publik** exponering — demon är **intern tills den är fixad**. Visa via LAN/SSH-forward, inte publik URL. | Spårad skuld |
| **Beers/STOPP exakta kriterie-ID:n** | Säg "sektion + DOI nu, exakt ID utestående" — ärligt, försvarbart. Gissa inte ID:n live. | Anders-beroende |
| **Haiku-beatens reproducerbarhet** | Behöver deterministisk debug-inject för pålitlig on-cue-demo (se §5). | Ej byggd |
| **Skärmbilder** | Måste återfångas före demo (§9). | Att göra |
| **profil-tagg→ICD (aldre_multisjuk syns som "diagnos")** | Kosmetiskt i kolumn 1 (Marianne visar en `aldre_multisjuk`-rad). Ofarligt men en arkitekt kan fråga — svar: profil-tagg ej normaliserad, spårat öppet. | Spårad skuld |

---

*Underlaget grundat i live-körningar mot cf4 (Opus 4.7-syntes) 2026-05-28. Verbatim-narrativ, exakta fynd/audit/timings fångade direkt från SSE-strömmen.*
