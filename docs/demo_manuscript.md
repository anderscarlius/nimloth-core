# Demo-manus — Nimloth-plattformen (30 min, mixad publik)

> **Format:** 30 min live-demo med strömmande UI + audit-tidslinje. **Publik:** VGR/Skåne ledning + klinisk informatik + arkitekter (mixad strategisk/teknisk). **Kanaler:** in-room (laptop+projektor), Teams (skärmdelning), YouTube (förinspelat). **Drivs av:** Anders, på laptop på LAN. **Två artefakter:** nimloth-atlas (arkitektur-vision, cf4:11006 internt / `nimloth-atlas.carlius.net` Cloudflare-Access-gated) + nimloth-core /med-review (S1-validerad AI-medicineringsgenomgång; `nimloth-demo` på cf4, LAN `192.168.1.189:11005` / publikt `nimloth-demo.carlius.net` bakom Cloudflare Access). **Grundat i:** `demo_underlag.md` (live-fångat 2026-05-28) + `atlas_capture.md` (live-fångat 2026-05-28).

> ⚠️ **Den viktigaste positioneringen:** atlas-L06-demon visar **imperativa** rekommendationer ur fixture-data ("seponera omgående") — det är prototyp-narrativ. /med-review visar **deskriptiva, S1-validerade** fynd — det är implementeringen. Manuset håller dem isär: atlas = vision, /med-review = defensiv implementering. Att vända imperativ-vs-deskriptiv till en *fördel* är hela poängen — visionen visar vad man *kan* göra, implementeringen visar hur man bygger det *defensivt*.

---

## Pre-flight checklist (innan demon)

Kör 30 minuter innan publik kopplar in. Demo-ytan körs på cf4 (`nimloth-demo`) — nås på LAN (`192.168.1.189:11005`) eller publikt via `nimloth-demo.carlius.net` (bakom Cloudflare Access). Backend-tjänsterna är interna.

- [ ] Laptop på LAN, kan nå 192.168.1.189
- [ ] `med-review-core` healthy på cf4:11403 (`curl http://192.168.1.189:11403/health`)
- [ ] `aql-template-service-core` healthy på cf4:11402
- [ ] `nimloth-atlas` healthy på cf4:11006 (öppna i browser, ser landningssidan)
- [ ] `nimloth-demo` healthy på cf4:11005 (`curl http://192.168.1.189:11005/healthz`) — ingen lokal `pnpm dev` behövs längre, demon körs på servern
- [ ] (om publik visning) `nimloth-demo.carlius.net` når Access-login → logga in
- [ ] Browser-flikar förinställda i denna ordning (alt+tab-flöde):
  1. Atlas landing: `http://192.168.1.189:11006/`
  2. Atlas L05.5 (ekosystem): `http://192.168.1.189:11006/L05.5`
  3. Atlas L06 demo: `http://192.168.1.189:11006/L06/demo`
  4. Atlas /migration: `http://192.168.1.189:11006/migration`
  5. /med-review (LAN): `http://192.168.1.189:11005/med-review` — publikt: `https://nimloth-demo.carlius.net/med-review`
  6. /med-review (inject): `http://192.168.1.189:11005/med-review?debug_inject=force_unsourced`
- [ ] Skärmbild-backups i `docs/operations/demo-assets/` öppna i ett extra fönster om något hänger live
- [ ] Tyst notifications, stäng Slack/mail
- [ ] Vatten

**Om Teams/YouTube:** dela hela skärmen, inte enskilt fönster — du kommer växla mellan flikar och ett enskilt fönster bryter strömmen.

---

## 00:00 — Öppning (2 min)

**Vad du säger** (öppningshook, varieras mellan publiker):

> "I dag pratar alla om AI i vården. De flesta demos jag ser pekar mot en stor språkmodell som läser ett patientfall och säger 'överväg att sänka warfarindosen'. Det där är lätt att bygga — och svårt att försvara inför en jurist, en medicintekniker eller en patient. Det jag visar idag är den motsatta inställningen: AI där varje *kliniskt beslut* fattas och valideras deterministiskt mot publicerade kriterier, och språkmodellen får skriva prosan men kan strukturellt inte fatta ett beslut. Det är skillnaden mellan demobar AI och deploybar AI i vården."

**Pekar fram:** två artefakter — atlas (arkitekturen, lager för lager) + /med-review (en implementering av lagren tillsammans). 30 minuter, allt på syntetisk data.

**Ledning kommer höra:** "platform = AI-readiness", den ärliga gränsen mellan demo och produktion. **Klinisk informatik kommer höra:** källbelagda fynd + audit + PDL. **Arkitekter kommer höra:** deterministisk klinisk logik + validerad LLM-syntes + bounded concurrency.

---

## 02:00 — Atlas: arkitekturen som vision (8 min)

> **Vad du gör:** flik 1, atlas landing (`192.168.1.189:11006/`).

**Vad du säger:**

> "Det här är nimloth-atlas — en publik visualisering av plattformen, lager för lager. Den är auth-gatad just nu eftersom vi har kapacitetsskäl, men ni får inbjudan efter mötet. Den finns för att du som arkitekt eller CIO ska kunna gå tillbaka, klicka runt, och se *hela* stacken — inte bara appen ovanpå."

**Stegen genom lagren — peka, klicka, kommentera kort:**

**02:30 — L00 (Driftinfra).** Klicka in på lagret.
> "Längst ner: faktisk hårdvara. Det här demot kör på en Synology DS923+ med 25+ containrar och Cloudflare Tunnel. Ärligt — det är inte ett white paper, det är en maskin på golvet."

**03:30 — L05.5 (Integrationsekosystem) — ärlighets-beaten.** Klicka in. Visa filterheadern.
> "Det här är den enskilt viktigaste sidan i hela atlasen, och jag vill att ni märker en sak längst upp." *(Peka på räkningen i headern.)* "16 svenska vårdsystem, fem kategorier — och *tre realiserade idag, tretton arkitektonisk vision*. Den räkningen står i headern, inte i fotnoten. Det är så jag tycker svensk vård-IT ska prata: säg vad som finns, säg vad som inte finns, blanda inte ihop dem. Det är samma princip som genomsyrar resten av plattformen."

> **Detta är beaten som landar starkast hos en ledningspublik.** Pausa 3-4 sekunder här. Låt den sjunka in.

**05:00 — L03 (openEHR-kärna).** Klicka in.
> "Mitten av stacken: openEHR internt, FHIR externt. openEHR ger oss två-nivå-modellering — arketyper, mallar, semantisk interoperabilitet. Det är grunden för att en regelmotor överhuvudtaget ska kunna *resonera* om data på ATC/ICD/arketyp-nivå istället för fritext."

**06:00 — L06 (Applikationer).** Klicka in. Visa Ingrid-prototypen kort.
> "Och här uppe: vad applikationerna kan se ut. Det här är en *prototyp* — en visionsbild av en läkemedelsgenomgång, med ganska direkta rekommendationer. Det är medvetet — det här är atlas, det är 'så här *kan* det se ut'. Om en sekund ska jag visa er hur man bygger det defensivt — vilket är en helt annan sak."

**07:30 — /migration (kort).** Klicka in.
> "En sista atlas-vy: migrering. Det här är *inte* en big-bang-utbyte av Millennium eller VAS. Det är strangler-fig — incrementell ersättning, lager för lager, med trafiken som flyttar över när varje lager står på egna ben. Det är hela bokens tes i en bild."

---

## 10:00 — Pivot: vision → defensiv implementering (1 min)

> **Vad du gör:** flik 5, /med-review (`localhost:3000/med-review`).

**Vad du säger:**

> "Vad ni just såg på atlas-L06 var en visionsskiss. Findings var imperativa — 'seponera omgående'. Det är prototyp-text ur en fixtur, för att visa *form*. Nu visar jag *implementeringen* — där varje fynd kommer från en deterministisk regelmotor med publicerad källa, där språkmodellen är instängd till syntes, och där varje kliniskt beslut den *försöker* skriva fångas av en separat validator innan det når läsaren. Samma typ av patient — Ingrid — men på riktigt arkitekterad."

> **Använd ordet "implementering" medvetet.** Det signalerar till tekniska åhörare att de ska titta efter byggdetaljer; till ledningen att det här är produkten, inte sketchen.

---

## 11:00 — Med-review: Ingrid kontraindikations-beaten (6 min)

> **Vad du gör:** Patient-väljaren visar 6 ankare. Klicka **Ingrid Andersson (74)**. Klicka "Starta genomgång".

**11:00 — Strömmen börjar.** Kolumn 1 (Patientdata) börjar fyllas. Steg-strippen överst visar progressionen.

**Vad du säger (medan kolumn 1 fylls, 30 sek):**
> "Det första som händer: agenten hämtar data — *stegat*, inte bredd-parallellt. Mediciner först. Sedan diagnoser. Sedan HbA1c-trend. Sedan allergier. Varje steg ger en audit-rad i kolumn 3 till höger. Stegad hämtning är inte en latens-optimering — det är *bounded concurrency*, vilket är samma sak som streaming-UX, vilket är samma sak som ett ärligt audit-spår. En mekanism, tre värden."

**11:30 — Fynd dyker upp i kolumn 2.** Sorterade severity high→low.

> **Pausa här ~5 sek.** Låt fynden registrera visuellt. Sedan peka på det röda fyndet överst.

**12:00 — Kontraindikation som beat.**
> "Det första fyndet, rött, högsta allvarlighetsgrad: penicillinallergi plus aktiv amoxicillin. Det här är ett kliniskt farligt fel — patient står på ett preparat hon är *dokumenterat allergisk* mot. Notera *hur* regeln resonerar — den matchar inte på strängen 'penicillin'. Den matchar på *läkemedelsklass* J01C-stjärnan. Amoxicillin är ett aminopenicillin; samma klass; ingen cross-reactivity-bedömning behövs. Anafylaxirisk vid återexponering. Källa: StatPearls."

> **Peka på citerings-länken.** Klicka eventuellt fram den om publiken är tekniska.

**13:00 — Narrative streamar in.** Claude-syntesen ackumuleras token-för-token i kolumn 2 under fynden.

**Vad du säger (medan den streamar, 30 sek):**
> "Och här skriver Opus narrativet. Den läser fynden, formulerar i klar prosa. Märk: 'S1-validerad' under syntesen — det betyder att varje kliniskt påstående i den här texten är spårad till ett fynd. Modellen kan strukturellt inte introducera ett beslut som inte motsvarar något i regelmotorn. Om jag visar er det om en stund."

**14:00 — Hela genomgången klar.** 4 fynd, ~10s.

> **Pausa, ta in helhetsbilden.** Peka kort på kolumn 3 (audit-tidslinjen) — fyra dataaccesser loggade, varje med mall, radantal, tid.

**14:30 — Stegad fördröjning + arkitektur-talspunkt.**
> "Hela genomgången tog tio sekunder. *Datahämtningen* tog tvåhundratrettio millisekunder — fyra AQL-frågor över docker-loopback. Resten — nio sekunder — är språkmodellen. Det är värt att markera: när vi mätte plattformen i tidigare faser trodde vi latensen satt i nätverket. Den gjorde inte det. Den satt i samtidighet mot ehrbase. Spaken var inte topologi, det var att hämta stegat. Det är den typen av lärdom man bara får av att faktiskt bygga och mäta."

> **Ledningen hör:** "de mäter, de korrigerar, de skriver ner". **Arkitekterna hör:** den specifika tekniska insikten. Båda spår serveras.

**15:30 — Subtilt arkitekt-försvar.** (Endast om någon visar tecken på att fråga.)
> "En sak ni *inte* ser i narrativet: läkemedlen där det inte finns något fynd. Hon står på simvastatin och metformin och omeprazol — de syns i kolumn 1, men nämns inte i syntesen. Det är medvetet: modellen sammanfattar bara fynden. Om den hade försökt dra in ett icke-fynd-läkemedel som ett kliniskt påstående hade validatorn fångat det. Det är S1-arkitekturen som fungerar i tystnad."

---

## 17:00 — Med-review: Marianne interaktion + Beers/STOPP (5 min)

> **Vad du gör:** Klicka tillbaka till patient-väljaren. Klicka **Marianne Lindqvist (81)**. Klicka "Starta genomgång".

**17:00 — Strömmen börjar igen.** Lite annorlunda profil — 8 mediciner, 6 diagnoser, ingen HbA1c (hon är inte diabetiker), ingen allergi.

**Vad du säger:**
> "Marianne, 81. Multisjuk äldre — förmaksflimmer på warfarin, depression på SSRI, gikt på allopurinol, hyperlipidemi, hypertoni. Åtta läkemedel, sex diagnoser, koherent klinisk bild — varje preparat har en motiverande diagnos. Den koherensen är inte slump, den är genererad: regelmotorn härleder diagnoser ur mediciner när vi byggde substratet, så varje warfarin har sitt I48, varje sertralin har sitt F32. Det gör genomgången realistisk."

**18:00 — Fynd dyker upp.** Tre stycken.

**18:30 — Stratifierad presentation (interaktion + Beers/STOPP).**
> "Tre fynd, stratifierade i två kategorier. Överst, rött: interaktionen — warfarin plus SSRI, ökad blödningsrisk. SSRI hämmar serotoninupptaget i trombocyter, additivt till warfarins antikoagulation; protrombintiden förlängs cirka fem till åtta procent. Källor: Pharmacy Times, en fall-kontrollstudie, och en svensk register-studie. Det här är *hård nivå* — handlingsbart kliniskt fynd."

> "Under det, två Beers/STOPP-fynd: warfarin hos äldre — INR-labilitet — och SSRI hos äldre — hyponatremi-risk. Det är *granska-nivå*. Beers och STOPP är *granskningsprompter*, inte stoppskyltar. Vi presenterar dem som 'potentiellt olämpligt — granska', med kriterie-citering. Marianne har förmaksflimmer; warfarin är inte fel för henne, det är ett fynd som flaggar att man kanske ska överväga DOAK. Stratifieringen är vad som gör skillnaden mellan en användbar genomgång och brus."

**20:00 — Källor.** Peka på citerings-länkarna under varje fynd.
> "Beers tjugotrettio och STOPP version tre — citerade med DOI. De exakta kriterie-ID:na för STOPP är vi ärliga om att vi inte gissar oss till; vi använder sektion plus primärreferens tills vi har originaltabellerna i hand. Det här är samma princip: säg vad som finns, säg vad som väntar."

**21:00 — Narrative streamar.** Samma mönster som Ingrid — narrativ ackumuleras live.

> **Pausa, låt det rendera.**

---

## 22:00 — Den största beaten: validatorn arbetar (4 min)

> **Vad du gör:** Lämna Marianne öppen. Öppna flik 6 (`localhost:3000/med-review?debug_inject=force_unsourced`) i en NY flik så att den normala är kvar.

**Vad du säger:**

> "Jag har sagt två gånger att språkmodellen är instängd till syntes och inte kan fatta ett kliniskt beslut. Nu visar jag varför ni ska tro det."

> "Nere på sidan ser ni en fuchsia-färgad indikator: 'DEBUG-INJECT aktiv'. Det är en demo-flagga — den finns inte i produktion, men den låter mig visa er säkerhetslagret arbeta på beställning. Vad den gör: den hoppar över språkmodellen helt och matar en *känd osourcerad text* — 'Överväg att sänka warfarindosen till 1,25 mg och sätt ut sertralin' — rakt in i validatorn. Den texten innehåller två saker som validatorn ska fånga: beslutsspråk ('överväg', 'sätt ut') och en doseringsrekommendation som inte motsvarar något i fynden. Klicka starta för Marianne."

**22:30 — Klicka "Starta genomgång".** Genomgången går igenom datahämtning normalt; sedan vid syntes-steget händer det:

**23:00 — Rosa avvisnings-banner dyker upp.** Steg-label: "Syntes avvisad (S1-skydd)". Den deterministiska fallback-syntesen rullar fram.

**Vad du säger (medan bannern lyser):**
> "Där. Validatorn fångade 'sätt ut' som beslutsspråk — det fanns ingen motsvarighet i fynden, så det är per definition ogrundat. Avvisning. Bannern syns röd-rosa: 'Syntes avvisad av S1-validering'. Den ogrundade texten kastas. I dess ställe får läsaren den deterministiska fallback-syntesen — samma fynd, samma källor, men formulerad templat-baserat istället för av modellen. Audit-spåret loggar att avvisningen skedde."

**23:30 — Den ärliga gränsen.**
> "En sak jag ska vara rak med: validatorn fångar varje kliniskt *beslut*. Den fångar inte nödvändigtvis varje *påstående*. Det är försvar-på-djupet med två deterministiska kontroller — beslutsspråk plus läkemedels-referens-kontroll i sluten värld — inte ett semantiskt bevis. För klinisk produktion vill man lägga fler lager. Men för den här demon, och för varje beslutsklass vi har stress-testat: ja, den fångar dem."

> "Och det är det här som är produkten, inte felet. Avvisningen är säkerhetslagret som *arbetar*. Ni ska vilja se den slå till — för det betyder att om en svagare modell någon dag försöker hallucinera ett doseringsförslag, så når det aldrig läsaren."

---

## 26:00 — Audit + arkitekturmässig stängning (1 min)

> **Vad du gör:** Stäng inject-fliken. Tillbaka till normal /med-review eller en av de tidigare körningarna. Peka på kolumn 3 (audit-tidslinjen).

**Vad du säger:**
> "Kolumn 3 — fyra dataaccesser per genomgång, varje med mall, radantal, latens, tidsstämpel. Det är PDL-spårbarhet ur en arkitektonisk självklarhet, inte ett påklistrat lager. Och det är samma sak som streaming-UX:en ni såg, samma sak som bounded concurrency — *en* mekanism, *tre* värden. Det är så plattformen är byggd: varje val gör samtidigt tre arbeten."

---

## 27:00 — Avslutning (3 min)

**Vad du säger:**

> "Det ni såg idag är två artefakter. Atlas — visionen — och /med-review — implementeringen. Det som binder ihop dem är inte tekniken, det är *positionen*. Plattformen är gravitationscentrum, applikationerna sitter ovanpå. Datat är strukturerat innan AI:n kommer in i bilden. Säkerhetsarkitekturen är skriven i kod, inte i avtal."

> "Det här är bokens tes — *Nästa generations hälsosystem* — i två demos. Plattformsinvestering är AI-beredskap; DORA-forskningen säger samma sak. Det är inte modellen som avgör om AI är användbart i vården, det är substratet under modellen."

> "Tre saker som händer härifrån:"

> "Ett: ni får Cloudflare Access-inbjudan till atlas inom det här mötet. Klicka runt, visa kollegor. Det är auth-gatat eftersom kapacitet och säkerhetshygien — *inte* hemligt. Inbjudan är ett relations-steg, inte en barriär."

> "Två: boken — artikelserien — är på väg ut, första kapitlet i maj. Atlas och /med-review är levande illustrationer av tesen i boken. Ni kommer kunna läsa argumentationen och samtidigt se den i kod."

> "Tre: nästa konversation. Vi tar tio minuter efter det här mötet och pratar om vad det här skulle betyda för er region specifikt. Inte sälj — bara konversation."

**Q&A öppnar.**

---

## Q&A — förberedda enradssvar

| Fråga (vad de troligen frågar) | Svar (en rad, klart) |
|---|---|
| "Är det här en medicinteknisk produkt?" | "Nej. Demonstration på syntetisk data. Men S1-arkitekturen — deterministiska regelmotorer + validerad LLM-syntes — *är* den arkitektur som skulle vara försvarbar grund om ni ville göra produktion-CDS. Vi visade arkitekturen idag, inte produkten." |
| "Varför inte ett live Janusmed-API?" | "Citerat, inte anropat. Det håller motorn deterministisk och auditbar. Ett live-API skulle introducera icke-determinism i exakt det lagret som måste vara förutsägbart." |
| "Varför bara en delmängd av Beers/STOPP?" | "Skopad delmängd av den *kompletta* motorn. STOPP-primärt, täcker demo-patienternas mediciner, explicit märkt 'delmängd'. Full integration är *data*, inte arkitektur." |
| "Var är de exakta kriterie-ID:na?" | "Sektion plus DOI nu (Beers 2023 doi:10.1111/jgs.18372, STOPP v3 doi:10.1007/s41999-023-00777-y). De alfanumeriska ID:na byts in när primärtabellerna är i hand. Vi gissar inte." |
| "Vad händer om LLM:en hallucinerar?" | "Titta — jag visar er." *(Kör debug-inject-beaten om den inte redan körts.)* "Det här är vad som händer." |
| "openEHR eller FHIR?" | "openEHR *internt* för semantisk djup-modellering. FHIR *externt* för interoperabilitet. Olika jobb. Inte ett val mellan, en kombination." |
| "Jämfört med Millennium / VAS / vendor X?" | "Komposabelt mot monolitiskt. Strangler-fig-migrering — incrementell ersättning, lager för lager. /migration-vyn i atlas visar det explicit. Bokens kapitel femton och sexton." |
| "Marianne har 'aldre_multisjuk' synlig som diagnos — vad är det?" | "Profil-tagg, spårat öppet för normalisering till äkta ICD-koder. Ärligt, inte gömt — samma princip som diabetes-koden vi normaliserade i veckan." |
| "Atlas-Ingrid har 10 mediciner, här-Ingrid har 4 — varför skiljer de?" | "Olika fixtures för olika syften. Atlas är prototyp-overlay (rikare scenario för UI-utforskning). /med-review är seed-scenariot. Principen är samma; värden skiljer." |
| "Verklig patientdata?" | "Syntetiskt för demonstration. Produktion skulle integreras via PDL med samtycke, ABAC, audit — allt det ni såg i L01-lagret på atlas." |
| "Skalbarhet med riktig patientvolym?" | "Bounded concurrency-design, inte topologi — vi visade latensprofilen. Datalagret skalar horisontellt, regelmotorerna är rena funktioner i minnet, syntesen är per-anrop. Inte en monolit som måste replikeras." |
| "Vad kostar en sådan här genomgång?" | "Med Opus 4.7: cirka två cent per genomgång. Med Haiku: under en halv cent. Modellvalet är en flagga, inte arkitektur — och valideringen fångar drift om man byter ner till en svagare modell." |
| "Vem driver det här?" | "Northfactor AB. Konsult-relation, ingen vendor-lock-in. Plattformskoden är öppen för era arkitekter att läsa." |
| "Hur lång tid tog det att bygga?" | "Plattform-bågen — substrat, mall-tjänst, AI-genomgång — bygd över [X månader]. Atlas är ett separat spår. Det är inte stort. Det stora är inte volym kod, det är att varje del är *byggd för att hålla* inför både tekniska och regulatoriska frågor." |
| "Kan vi få tillgång till atlas?" | "Ja — Cloudflare Access-inbjudan kommer efter mötet. Mejl-adressen ni har här i rummet." |
| "Vad är nästa steg om vi vill prata vidare?" | "En timme nästa vecka, era arkitekter plus mig. Inte sälj, mappning av vad ni har och vad ni saknar." |

---

## Om något bryts live — återhämtning

**Dashboarden hänger eller renderar inte:**
- Trigga F5. Vänta tio sekunder. Om fortfarande tomt, kolla browser-console (näst sannolikt: SSE-proxyn).
- Backup: öppna en av skärmbilds-PNG:erna i `docs/operations/demo-assets/` i nytt fönster, fortsätt narrativt utan att klicka.
- Säg rakt ut: "live-demon hänger; här är skärmbilden från en körning för en timme sedan — innehållet är identiskt." Publiken accepterar transparens; den blir orolig om du försöker dölja det.

**Claude-API:t tar lång tid eller faller ut:**
- Det syns som att syntes-steget hänger. Vänta upp till 30s.
- Om det faller: tryck om eller flippa till deterministiskt läge (env-flagga `MED_REVIEW_SYNTH_MODE=deterministic` — om vi byggt den; annars beskriv beteendet).
- Säg: "språkmodellen är extern dependency. När den är nere går vi till deterministisk fallback automatiskt. Samma fynd, mallad prosa." Det *är* säkerhetsarkitekturen i arbete — vänd nedtid till bevis.

**Cf4 är otillgänglig:**
- Allt ovanpå (atlas + /med-review) faller. Detta är värsta scenariot.
- Backup: hela demo-pathen som skärmbilder + den verbatim-syntesen från `demo_underlag.md`. Berätta narrativet med stillbilder.
- Säg: "infrastrukturen är på en NAS som inte är online just nu. Här är en körning från igår — vad ni ser är vad ni hade sett live." Korthet och raka besked.

**Någon ifrågasätter ärlighet (sällsynt men möjligt):**
- Det här är *inte* ett misslyckande. Det är publiken som engagerar sig på rätt nivå.
- Hänvisa till ärlighets-skiftet i atlas L05.5 (3 realiserat / 13 vision i headern), STOPP-citeringen som "sektion + DOI, ID utestående", och Beers/STOPP-stratifieringen ("granska, inte stopp").
- Säg: "om jag någonsin överpåstår nåt — säg till. Hela poängen är att inte göra det."

---

## Kanal-anpassningar

### In-room (laptop + projektor)
- Projektor-tid: avsätt 5 min för uppkoppling, säkerhetsmarginal.
- Glöm inte cursor-storlek (öka i OS-inställningar för stora skärmar).
- Sitt så du ser publikens ansikten — paus-läsning är 30% av en bra demo.

### Teams (skärmdelning)
- Dela hela skärmen, inte enskilt fönster (du växlar mellan flikar).
- Stäng allt annat — notifikationer, Slack, mail.
- Be inte publiken slå på kameror; det är distraherande för dig som driver.
- Inspela mötet om du har samtycke — användbart för internt återbruk.

### YouTube (förinspelat)
- Spela in på *samma* maskin som demon kommer köras på — säkerställ att miljön är reproducerbar.
- Två-tagningar minst — ett rent försök, ett där du *medvetet triggar* en avvisning för att visa beaten kontrollerat.
- Klippa endast för längd, inte för att dölja problem — om något hängde, säg det i kommentaren under videon.

---

## Ärlighets-gränser (talspunkter, snabb-referens)

Att hålla i huvudet, inte att läsa upp:

- **"Varje kliniskt *beslut* fångas deterministiskt — inte varje påstående."** Validatorn är försvar-på-djupet, inte semantiskt bevis.
- **"Demonstration, ej medicinteknisk produkt, ej beslutsstöd."** Står synligt i UI:t.
- **"Syntetisk data, 1005 syntetiska EHR."**
- **"Beers/STOPP exakta kriterie-ID:n utestående — primärtabellerna ej i hand. Sektion + DOI nu."**
- **"L05.5 ekosystem: 3 realiserat, 13 vision."** Räkningen står i headern.
- **"Atlas är prototyp-vision. /med-review är defensiv implementering."** Olika roller.
- **"Co-location bevisad att inte vara latens-spaken."** Bounded fetch är det.
- **"AI-modell är en flagga, inte arkitektur."** Switchen Opus↔Haiku finns; validatorn fångar drift.

---

## Post-demo checklist (samma dag)

- [ ] Skicka Cloudflare Access-inbjudan till varje deltagare som bad om det (mejl-lista i kalenderbjudan).
- [ ] Korta uppföljnings-mejl till varje deltagare: tack, länkar till boken/artikeln, en konkret nästa-steg-fråga.
- [ ] Skriv en kort intern post-mortem: vad funkade, vad höll på att gå sönder, vilka frågor kom upp som vi inte hade förberett.
- [ ] Notera Q&A-frågor som inte fanns i bordet ovan — uppdatera detta dokument.
- [ ] Om något bröts live: skriv post-mortem för det också, fixa innan nästa körning.
- [ ] Boka uppföljning med de som visade konkret intresse — inom 7 dagar.

---

## Att-fixa innan nästa körning

- [ ] Cloudflare Access-rättigheter för specifika kontakter (kapacitet: hantera en handfull åt gången).
- [ ] Beers/STOPP exakta kriterie-ID:n när primärtabellerna kommer in — egen liten källref-commit.
- [ ] Atlas-skärmbilder kompletta (resten av layer-batchen + demo-batchen om de inte hunnit landa).
- [ ] Profil-tagg-skulden (hypertoni→I10, hjärtsvikt→I50, kol→J44) — fix-när-konsumerad, samma princip som diabetes_typ2→E11.
- [ ] mock-auth — publik exponering är nu live men **mitigerad av Cloudflare Access** (`nimloth-demo.carlius.net`). Åtgärda mock-auth innan Access-gaten någonsin tas bort. Backend-portarna (11402/11403) förblir interna.
- [ ] Allergi-harmonisering atlas-Ingrid (urtikaria/moderate) vs core-Ingrid (anafylaxi/high) om båda visas i samma demo upprepade gånger.

---

*Manuset grundat i live-fångade demo-underlag (`demo_underlag.md`) och atlas-capture (`atlas_capture.md`) 2026-05-28. Plattformen är Fas 1–3 committad och pushad till `origin/main`. Detta manus är skrivet för att kunna köras direkt på den deployen, oförändrad.*
