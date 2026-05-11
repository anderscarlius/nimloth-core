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
| 1 | 0.2.0 | Terminologitjänst + Care-unit-edge | ✅ Klar |
| 2 | 0.3.0 | openEHR parallellt kanoniskt lager + AI-mapping (P3-P4) | ✅ Klar (P4 levererad 2026-05-11) |
| 3 | 0.4.0 | Inera-stacken (SITHS, HSA, PDL, NPÖ, Pascal) | ⏳ Planerad |
| 4 | 0.5.0 | Lakehouse + OMOP + datakvalitet | ⏳ Planerad |
| 5 | 0.6.0 | CDS-regler med CQL-motor + portabilitet | ⏳ Planerad |

Detaljer i [`docs/ROADMAP.md`](docs/ROADMAP.md).

---

## Tjänster

Repot är ett pnpm-workspace med tjänster i `services/` och delade paket i `packages/`.

### Kärntjänster

| Tjänst | Port (dev/deploy) | Status | Beskrivning |
|---|---|:---:|---|
| [`composition-mapper`](services/composition-mapper/) | 3001 / **11102** | ✅ P4 levererad | FHIR R4 → openEHR `medication_summary.v1`-mappning med LLM-assist. HTTP API `POST /api/v1/map/medication-statement`. Demo-instans aktiv på CarliusFyra:11102 (synthetic-mode). |
| [`mapping-assistant`](services/mapping-assistant/) | 3009 | 🔄 Sprint 2 | Dev-tids mapper-generator (propose/observe/ask-flöden). Signed prompts, sensitivity-aware routing. |
| [`fhir-facade`](services/fhir-facade/) | 3003 | ✅ Sprint 1 | FHIR R4 SE-fasad mot kanoniskt lager. Parity-mätning postgres ↔ openEHR. |
| [`openehr-composer`](services/openehr-composer/) | — | ✅ Sprint 2 (P3) | Composer-pipeline för att skapa openEHR-compositions från event-stream. |
| [`transform`](services/transform/) | 3002 | ✅ Sprint 1 | CDC → domän-event-transformeringar (7 mappings). |
| [`ingest`](services/ingest/) | 3001 | ✅ Sprint 1 | Kafka Connect / Debezium-baserad CDC från källsystem. |
| [`audit`](services/audit/) | 3005 | ✅ Sprint 1 | PDL-audit-spår, outbox-pattern. |
| [`dashboard`](services/dashboard/) | 3010 | 🔄 Sprint 2 | React-dashboard för operations + parity-trend. |
| [`care-unit-edge`](services/care-unit-edge/) | — | 🔄 Sprint 1 | SQLite-baserad edge-deploy för vårdcentraler. |
| [`cds-hooks`](services/cds-hooks/) | 3004 | ⏳ Sprint 5 | CDS Hooks-service för CQL-baserade regler. |
| [`terminology`](services/terminology/) | — | 🔄 Sprint 1 | SNOMED + ICD-10-SE + LOINC-uppslag via Snowstorm. |

### Delade paket

| Paket | Beskrivning |
|---|---|
| [`model-router`](packages/model-router/) | Provider-routing baserat på data-sensitivity (`phi`/`pii`/`synthetic`/`schema-only`/`public`). PHI hard-låst till on-premise. Anthropic + Ollama + Mock-providers. |
| [`shared`](packages/shared/) | Delade typer och utilities. |
| [`kafka-utils`](packages/kafka-utils/) | Kafka-konsument/producent-wrappers. |
| [`kafka-test-producer`](packages/kafka-test-producer/) | CLI-producent för demo/test-events. |
| [`test-data`](packages/test-data/) | Delade test-fixtures (Fru Andersson m.fl.). |

### Sprint 2 / P4 — composition-mapper levererad

P4 (FHIR R4 → openEHR-mappning med LLM-assist) är levererad 2026-05-11.
Permanent demo-instans aktiv på CarliusFyra:11102.

**Slutmätningar (mot Anthropic claude-sonnet-4-6, synthetic-mode):**
- Field-accuracy: **98.9%** (mål ≥85% — uppfyllt)
- Review-recall: **64.7%** (mål ≥95% — partiellt, B23 Sprint 3-arbete)
- False-positive-review-rate: 3.0% (mål ≤10% — uppfyllt)
- Mean latency: 4.5s per anrop

**Demo-instans-test:**
```bash
curl http://192.168.1.189:11102/health
# {"status":"ok","dataMode":"synthetic","audit":{"disabled":true,...},...}
```

**Deploy via git-pull:**
```bash
ssh SkyttenAdmin@192.168.1.189
cd /volume2/docker/nimloth-core
git pull origin main
/volume2/@appstore/ContainerManager/usr/bin/docker-compose \
  -f docker-compose.deploy.yml up -d --build composition-mapper
```

Service-detaljer i [`services/composition-mapper/README.md`](services/composition-mapper/README.md). Demo-flöde i [`docs/operations/Demo_Runbook.md`](docs/operations/Demo_Runbook.md).

---

## Dokumentation

### Arkitektur och vision

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
| [`docs/Runbook_Deploy.md`](docs/Runbook_Deploy.md) | Deploy-pipeline + rebuild-procedur |
| [`docs/prompts/`](docs/prompts/) | Utbyggnadsprompter P1–P7 |
| [`infra/openehr/`](infra/openehr/) | openEHR-spår: ADL-källor, OPT-templates, batch-compiler |

### Operations (P4-leverans)

| Dokument | Innehåll |
|---|---|
| [`docs/operations/Demo_Mode_Configuration.md`](docs/operations/Demo_Mode_Configuration.md) | `NIMLOTH_DATA_MODE`-env, sensitivity-tier, demo vs produktion |
| [`docs/operations/Human_Review_Pathway_Design.md`](docs/operations/Human_Review_Pathway_Design.md) | Aggregator-design, threshold-kalibrering, P4-mätningar |
| [`docs/operations/Human_Review_Demo_Talking_Points.md`](docs/operations/Human_Review_Demo_Talking_Points.md) | CIO-frågor och svar inför demo |
| [`docs/operations/Demo_Runbook.md`](docs/operations/Demo_Runbook.md) | Pre-demo-checklist, demo-flöde, troubleshooting |
| [`docs/operations/Pre_Public_Demo_Checklista.md`](docs/operations/Pre_Public_Demo_Checklista.md) | Tidigare demo-checklista (B19-leverans) |

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

Licensvillkor är ännu inte fastställda. Repot är publikt för granskning och arkitektur-diskussion under utvecklingsfasen; kommersiell användning kräver kontakt med upphovsperson.
