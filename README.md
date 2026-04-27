# Nimloth Core

**En modern vårdplattform för svensk sjukvård — byggd på öppna standarder, distribuerad från grunden.**

Nimloth Core är en modulär journal- och vårdplattform designad för primär- och slutenvård i Sverige. Den bygger på openEHR som kanonisk klinisk datamodell, FHIR R4 SE som utbytesformat, event-driven integration, och en djup PDL-enforcement-stack. Plattformen är designad för att fungera resilient — från regional centraldrift ner till enskilda vårdcentraler med instabila nätförbindelser.

---

## Vad Nimloth Core är

- **Journalplattform** — full clinical data lifecycle, inte bara en läsvy över befintliga system.
- **Modulär monolit** — intern tjänstestruktur med kontrakt, en deploy-enhet, men förberedd för framtida separation.
- **openEHR internt, FHIR externt** — kliniska modeller uttrycks som openEHR-arketyper; omvärlden pratar FHIR R4 SE.
- **Event-first** — domänhändelser driver audit, notifieringar, integration och replikering.
- **Distributed by design** — varje vårdenhet kan fortsätta arbeta offline upp till 30 dagar; synkar automatiskt vid reconnect.
- **PDL-korrekt från dag ett** — autentisering, auktorisering, vårdrelation, spärrkontroll och audit som arkitektoniska primitiver, inte efterkonstruktion.

## Vad Nimloth Core inte är

- Inte ett fullskaligt regionjournalsystem dag ett (fokus: primärvård + mindre slutenvård initialt).
- Inte en mikrotjänstplattform dag ett (modulär monolit som möjliggör framtida separation).
- Inte en ersättare för alla externa system (integrerar med Melior, AsynjaVisph, Pascal, NPÖ osv.).
- Inte en integrationsmotor i sig — för det finns systerprodukten [Nimloth Flow](#nimloth-familjen).

---

## Snabbstart

```bash
# Single-node på laptop
./scripts/start.sh
./scripts/demo-fru-andersson.sh

# Distribuerat läge med edge-nod
./scripts/start-distributed.sh
./scripts/simulate-network-failure.sh
```

Öppna dashboard: http://localhost:3010

Fullständiga installationsanvisningar finns i [`docs/INSTALL.md`](docs/INSTALL.md).

---

## Fru Andersson — det primära scenariot

Hela plattformen drivs av ett konkret scenario: en 74-årig kvinna med artros, höftprotes, postoperativ DVT och pågående Waran-behandling som faller i hemmet och kommer till akuten. Akutläkaren behöver tre svar på under 15 sekunder:

1. Vilka mediciner står hon på?
2. Är hon antikoagulerad?
3. Har hon några kända allergier?

Utan plattform: tre system, tre inloggningar, manuell samordning. Med Nimloth Core: en FHIR-endpoint, ett UI, CDS-kort i akut kontext, svar på under en sekund.

Detaljerad beskrivning i [`docs/SCENARIO.md`](docs/SCENARIO.md).

---

## Arkitektur i ett öga

```
┌─────────────────────────────────────────────────────────────────┐
│ Presentation     Dashboard (React) · FHIR-klienter · EHR-plugins │
├─────────────────────────────────────────────────────────────────┤
│ Consumption      FHIR Facade R4 · CDS Hooks · Audit · Secondary  │
├─────────────────────────────────────────────────────────────────┤
│ Canonical        openEHR (EHRbase) + FHIR-materialisering         │
├─────────────────────────────────────────────────────────────────┤
│ Transform        7 domän-mappningar, AI-assisterade               │
├─────────────────────────────────────────────────────────────────┤
│ Event Bus        Kafka KRaft · domän-topics · aggregation         │
├─────────────────────────────────────────────────────────────────┤
│ Ingest           Kafka Connect · Debezium CDC                     │
├─────────────────────────────────────────────────────────────────┤
│ Sources          Melior · AsynjaVisph · FlexLab · Pascal · NPÖ   │
└─────────────────────────────────────────────────────────────────┘

  Parallella stack-komponenter:
   • Lakehouse (bronze/silver/gold) för sekundäranvändning + OMOP
   • Identity & Catalog (SITHS/HSA/Sambi) + PDL decision service
   • Care-unit-edge (SQLite + HTTP sync) för vårdcentralsnivå
   • Client-edge (PWA) för mobil och ambulans
```

Fullständig arkitektur i [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Status och roadmap

Nimloth Core befinner sig i tidig arkitekturell uppbyggnad. Den nuvarande koden är ärvd från Nimloth Flow (dess PoC-förfader) och utökas enligt sprintplanen:

| Sprint | Version | Innehåll | Status |
|---|---|---|---|
| 0 | 0.1.0 | Initial import, Nimloth-identitet etablerad | ✅ Klar |
| 1 | 0.2.0 | Terminologitjänst + Care-unit-edge | 🔄 Pågående |
| 2 | 0.3.0 | openEHR parallellt kanoniskt lager + AI-mapping | ⏳ Planerad |
| 3 | 0.4.0 | Inera-stacken (SITHS, HSA, PDL, NPÖ, Pascal) | ⏳ Planerad |
| 4 | 0.5.0 | Lakehouse + OMOP + datakvalitet | ⏳ Planerad |
| 5 | 0.6.0 | CDS-regler med CQL-motor + portabilitet | ⏳ Planerad |

Detaljer i [`docs/ROADMAP.md`](docs/ROADMAP.md).

---

## Dokumentation

| Dokument | Innehåll |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Lager-för-lager-beskrivning av arkitekturen |
| [`docs/SCENARIO.md`](docs/SCENARIO.md) | Fru Andersson-scenariot i detalj |
| [`docs/DESIGN.md`](docs/DESIGN.md) | Designsystem och UI-tokens |
| [`docs/EXTENDING.md`](docs/EXTENDING.md) | Anslut ett nytt källsystem |
| [`docs/INSTALL.md`](docs/INSTALL.md) | Deploy på CarliusFyra, VPS, Kubernetes |
| [`docs/QUICKDEMO.md`](docs/QUICKDEMO.md) | 3 / 10 / 20-minuters demoguider |
| [`docs/POSITIONING.md`](docs/POSITIONING.md) | Nimloth-familjens struktur |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Utvecklingsplan sprint för sprint |
| [`docs/prompts/`](docs/prompts/) | Utbyggnadsprompter P1–P7 |
| [`infra/openehr/`](infra/openehr/) | openEHR-spår: ADL-källor, OPT-templates, batch-compiler |

---

## Nimloth-familjen

Nimloth är inte en ensam produkt utan ett plattformskoncept med flera implementationer:

- **Nimloth Core** (denna repo) — full journal- och vårdplattform.
- **Nimloth Flow** ([separat repo](https://github.com/anderscarlius/nimloth-flow)) — integrationsmotor för att lyfta data från befintliga källsystem till en FHIR-vy.

Produkterna delar arkitekturfilosofi och ursprung men utvecklas oberoende. För val mellan dem, se [`docs/POSITIONING.md`](docs/POSITIONING.md).

---

## Kontribution

Detta projekt är under aktiv utveckling och välkomnar förslag på arkitektur, kod och dokumentation. Läs [`CONTRIBUTING.md`](CONTRIBUTING.md) för riktlinjer.

Arbetssätt:
- Prompter i [`docs/prompts/`](docs/prompts/) utgör aktuell arbetsstack.
- Issues märks med sprint-label (`sprint-1`, `sprint-2` osv).
- PRs verifieras mot att `./scripts/demo-fru-andersson.sh` fortsätter fungera.

---

## Ursprung och ägarskap

Nimloth Core är forkad från Nimloth Flow (f.d. VGR Datahub) vid tag `v0.1-pre-fork`. Ursprunget är gemensamt, utvecklingen är nu parallell.

Arkitekt och upphovsperson: Anders Carlius.

Projektet är kopplat till artikelserien *Nästa generations journalsystem* (18+1 artiklar), som utgör det arkitektoniska och politiska fundamentet för plattformen.

---

## Licens

Specificeras i [`LICENSE`](LICENSE).
