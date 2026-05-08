# Human Review Pathway — Demo Talking Points

**Status:** Demo-stöd för P4-presentation
**Användning:** Anders vid demo + intervjuer + artikelreferens
**Senast uppdaterad:** 2026-05-08
**Komplement:** `Human_Review_Pathway_Design.md` (teknisk designdoc)
**Versionerat:** ja (i nimloth-core).

---

## 1. Demo-fråga: "Vad händer om systemet inte vet?"

**Snabbsvar (15 sekunder):**

> "I de här fallen producerar systemet inte ett påhittat svar — det
> producerar en granskningspayload som visar vad det vet, vad det är
> osäkert om, och exakt varför. En klinisk användare ser samma data som
> modellen och kan godkänna, korrigera eller avvisa. Det här är inte en
> eskaleringsmekanism — det är en del av varje mappning."

**Längre svar (1 minut):**

> "Mappningen utförs i två lager. Det första är deterministisk — direkta
> 1:1-relationer från FHIR-fält till openEHR-fält där tolkning inte
> behövs. Det andra är LLM-assisterad — för fritextfält som
> doseringsanvisningar där en numerisk dos behöver extraheras, eller
> där status behöver inferreras från kontext.
>
> Aggregator-komponenten kombinerar båda lagren och beslutar om
> resultatet är pålitligt nog. Det finns tre triggers för granskning:
> saknad required-data, motstridiga signaler från deterministisk vs
> LLM, och låg sammanlagd confidence. När någon triggar produceras en
> strukturerad payload med `fieldEvidence` per fält — kliniker ser
> exakt vilket fält som drog ned aggregatet och varför."

## 2. Demo-fråga: "Hur ofta händer det?"

> *[siffror efter 4.9 — TODO: uppdatera när eval-runner körts mot
> Hemmabasen LLM-pathway]*
>
> "Vårt eval-set är 50 manuellt skrivna par. Av dessa är 17 designade
> för att utlösa granskning — de innehåller status-värden som inte är
> deterministiskt mappningsbara, free-text dosering som är medvetet
> tvetydig, eller saknade required-fält. När 4.9-iterationen är klar
> har vi konkreta siffror på review-recall (hur många expected-review
> som faktiskt utlöser) och false-positive-rate (oväntade reviews).
>
> Det här är medvetet — eval-set är designat för att testa edge cases.
> Real produktionsfrekvens beror på källdatakvalitet och kommer
> kalibreras post-deployment."

## 3. Demo-fråga: "Är det inte risk att systemet säger 'jag vet inte' för ofta?"

> "Vi har tänkt på det som ett trade-off. False-positive review är en
> kostnad i klinisk tid — kliniker måste granska något som egentligen
> var korrekt. False-negative — att systemet accepterar en felaktig
> mappning — är patient-risk. Vi väljer kostnaden över risken.
>
> Threshold för aggregat-confidence (default 0.7) är kalibreringspunkten.
> Om vi sätter den för högt får vi för många reviews; för lågt och vi
> riskerar accepterade fel. Eval-set:t kalibrerar var den ska ligga.
>
> Dessutom är granskningspayloaden direktstyrd — kliniker ser inte
> bara att systemet är osäkert, utan vilket exakt fält och varför.
> Det reducerar granskningstiden från minuter till sekunder per fall."

## 4. Demo-fråga: "Hur skiljer det er från Epic/Cerner/Cosmic?"

> "Befintliga journalsystem hanterar typiskt inkommande data som binärt
> — antingen lita eller faila. När en mappning misslyckas blir det ett
> fel i loggen som någon eventuellt får syn på.
>
> Human review som strukturell del av varje mappning är ovanligt
> utanför specialiserade ML-driven systems. Vad vi gör är inte unikt
> i AI-världen — det är vanligt i ML-pipelines för säkerhetskritiska
> domäner — men att applicera det på *journaldata* är där Nimloth
> tar position. Se `POSITIONING.md` för fullständig kontext."

## 5. Demo-fråga: "Vad gör en kliniker faktiskt med en review-payload?"

> *[Notering: UI är inte implementerat i P4. Beskrivningen nedan är
> konceptuell.]*
>
> "Granskningen presenteras som en 'composition-mapping-review' i ett
> klinikergränssnitt — analogt med en code-review-upplevelse fast för
> klinisk semantik.
>
> Kliniker ser:
> - Källfält från FHIR (vad systemet fick som input)
> - Modellens förslag per fält (vad systemet skulle vilja sätta)
> - Confidence per fält (hur säker modellen är)
> - Reasoning per LLM-fält (varför modellen tänker som den gör)
> - Alternativa tolkningar där relevant
>
> Klick: godkänn / korrigera / avvisa per fält. Aggregat-payloaden
> bekräftas eller modifieras. Om kliniker korrigerar fält feed:as det
> tillbaka till mappnings-pipelinen som approved version. På sikt kan
> dessa korrigeringar bli few-shot-exempel för modellförbättring (se
> `Human_Review_Pathway_Design.md` sektion 6.3 om active learning)."

## 6. Demo-fråga: "Är detta produktion-ready?"

> "Ärligt: P4 levererar logiken. UI och feedback-loop är post-MVP.
>
> Vi är på *threshold-kalibrering*-fasen. Konkreta nästa steg:
>
> - **B22 (post-P4):** template-utvidgning för live-POST mot
>   medication_summary.v1 i EHRbase. Den deployerade templaten är
>   minimal-pivot från P3.0b — composition-mapper:s output behöver
>   en mer fullständig template för att validera mot openEHR-CDR.
> - **Sprint 3:** audit-pipeline för review-beslut (godkänd/korrigerad/
>   avvisad) — idag emittas bara MAPPING_RUN-events vid mapping-tid.
>
> För regional pilot — om granskning kan ske via ett enkelt UI och
> review-beslut accepteras strukturellt — är vi tekniskt redo. Det
> kräver dock en partner som vill bygga klinikergränssnittet ovanpå
> vår strukturerade payload."

## 7. Att undvika

Prata inte om:

- **Specifika confidence-värden från 4.9 utan kontext** — siffror utan
  förklaring av kalibrering kan misstolkas. Säg alltid "i vårt eval-set"
  och referera storleksordningen, inte exakta procent.
- **Garantier om accuracy** — inga "99% säkert"-formuleringar finns
  i specen och ska inte kommuniceras. P4 levererar mätbarhet, inte
  garantier.
- **Jämförelser med andra LLM-baserade hälso-system utan kvalificering**
  — vi vet inte hur Mayo Clinic eller Karolinska bygger sina interna
  system. Säg "vad jag ser i tillgänglig litteratur" eller "i andra
  sammanhang vi byggt".
- **Att review-pathway är 'AI-säkerhet'** — det är klinisk-säkerhet.
  Nyans: AI är delkomponent, säkerhetsmodellen är klinisk.

## 8. Visuella hjälpmedel

Förbered för demo:

| Tillgång | Plats | Beskrivning |
|---|---|---|
| Aggregator-flow-diagram | TBD | Deterministic + LLM → aggregate → review/complete |
| Eval-set-fördelning | `eval-set/README.md` | 12/23/15 simple/moderate/complex |
| Exempel-review-payload (JSON) | Generera från `med-049` | Worst-case-fall med flera null-fält + review |
| Threshold-känslighet | TBD efter 4.9 | Tabell threshold (0.5/0.7/0.9) → review-recall + FPR |
| Code-review-analogi | Skiss | Side-by-side: GitHub PR-review-UI ↔ kliniker-review |

## 9. Stand-up-format för 5-minuters demo

```
1. Open (30s):
   "Composition-mapper tar FHIR-medicinering, producerar openEHR-
   composition. Klassiskt mappningsproblem — utom att vi behandlar
   osäkerhet som en first-class output."

2. Live (2 min):
   - Visa eval-set/med-001.json (simple — passes through)
   - Visa eval-set/med-049.json (worst-case — review-required)
   - Run pnpm eval — visa rapport-output

3. Förklara aggregator (1.5 min):
   - Deterministisk + LLM → aggregate
   - Tre triggers (missing/conflict/low-confidence)
   - Min-rule motivation

4. Bridge to next (30s):
   "Det här är ett pattern vi vill se mer av — strukturerad osäkerhet,
   inte binärt godkänd/avvisad. Sprint 3 lägger på audit-pipeline
   för review-beslut."

5. Q&A (resterande tid):
   Använd sektion 1-7 som källa för svar.
```

## 10. Revisionslogg

| Version | Datum | Ändring |
|---|---|---|
| v1 | 2026-05-08 | Initial leverans (P4 4.6b). Sektion 2 har platshållare för 4.9-mätningar — uppdatera när eval-runner körts. |
