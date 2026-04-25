# Nimloth-familjen — positionering

**Detta dokument är identiskt i repositorys `nimloth-core` och `nimloth-core`.**
Ändringar ska synkroniseras mellan bägge repon.

---

## 1. Nimloth som plattformskoncept

*Nimloth* är ett plattformskoncept för svensk sjukvårds-IT. Det är inte en enskild produkt utan en familj av implementationer som alla delar:

- Event-driven arkitektur
- FHIR R4 SE som externt utbytesformat
- PDL-enforcement som arkitektonisk primitiv
- Distributed by design — lokal drift ska fungera även när nationella eller regionala länkar inte gör det
- Öppna standarder där möjligt, pragmatiska val där det krävs

Konceptet växer ur artikelserien *Nästa generations journalsystem* och dess argument att svensk sjukvård är ett distribuerat system av lag, klinisk praxis och politisk kultur — och att varje IT-arkitektur som behandlar det som ett centraliserat system kommer att misslyckas.

Inom Nimloth-familjen finns idag två aktivt utvecklade produkter:

- **Nimloth Core** — full journal- och vårdplattform
- **Nimloth Core** — integrationsmotor för befintliga källsystem

---

## 2. Nimloth Core

Nimloth Core är en **modulär journal- och vårdplattform**. Den hanterar en fullständig clinical data lifecycle — från datainmatning via clinical workflows till kanonisk lagring och utbyte.

### Kärnkaraktär

- **openEHR internt, FHIR externt** — kliniska modeller uttrycks som arketyper; omvärlden pratar FHIR R4 SE.
- **Clinical workflows** — inte bara datalagring utan stöd för faktiska vårdprocesser.
- **Inera-integrerad** — SITHS, HSA, Sambi, NPÖ, Pascal, BankID är strukturellt inbyggda.
- **PDL som decision service** — dedicated microservice med AuthN → AuthZ → vårdrelation → spärr → audit.
- **Resiliens i flera skikt** — region-edge, vårdcentrals-edge, klient-edge. Offline upp till 30 dagar.
- **Sekundäranvändning via lakehouse** — bronze/silver/gold med OMOP-export för forskning och EHDS.
- **AI-assisterad drift** — mapping-assistant som genererar och övervakar integrationer.

### Användningsfall

- Ersättning eller komplement till existerande journalsystem i primärvård eller mindre slutenvård
- Grund för regional plattformssatsning baserad på öppna standarder
- Pilotsystem för clinical workflows som dagens leverantörssystem inte stödjer
- Referensarkitektur för vad en modern vårdplattform ser ut

### Mognadsgrad

Under aktiv arkitekturell uppbyggnad. Sprint 1–5 (14 veckor) bygger ut från Flow-arvet till full plattformsmålbild. Se `docs/ROADMAP.md` i Nimloth Core-repot.

---

## 3. Nimloth Core

Nimloth Core är en **integrationsmotor**. Den lyfter data från befintliga källsystem till en FHIR-baserad läsvy utan att ändra källorna.

### Kärnkaraktär

- **CDC-driven** — Debezium mot PostgreSQL-baserade källsystem (Melior, AsynjaVisph osv.).
- **Kafka som transport** — domän-topics med väldefinierad retention och partitionering.
- **7 semantiska transformer** — översätter CDC-events till FHIR-domänhändelser.
- **FHIR Facade R4** — enhetlig läsvy mot allt sammanflödat data.
- **CDS Hooks** — tre kliniska regler (antikoagulation, implantat, DVT) mot den sammanslagna datan.
- **Distribuerat läge** — edge-noder per sjukhus med lokal Kafka och offline-tolerans.
- **PDL-korrekt audit** — varje läsning loggas med vårdrelation, syfte och vårdenhet.

### Användningsfall

- Demonstrera event-driven integration mellan journalsystem
- PoC för hur CDC + Kafka kan ersätta punkt-till-punkt-integrationer
- Referens för regionala beslutsfattare som väger modernare integrations-arkitekturer
- Grund för en framtida full plattform — Flow kan principiellt agera data-ingest för Nimloth Core

### Mognadsgrad

Stabiliserad. Skop-fryst på integrationsfunktionalitet. Vidareutveckling sker inom tydliga ramar; plattforms-ambitioner hör till Nimloth Core.

---

## 4. Relationen mellan Core och Flow

### Gemensamt ursprung

Bägge produkter härstammar från VGR Datahub-PoC:n, byggd våren 2026 som demonstration av moderna integrations- och arkitektur­mönster för Västra Götalandsregionen. Vid tag `v0.1-pre-fork` döptes produkten om till Nimloth Core, och en parallell fork skapades som Nimloth Core.

### Parallell utveckling

De två produkterna utvecklas oberoende. Ingen automatisk kodsharing sker. Ingen mekanism länkar reponen utöver att de delar idéer, konventioner och arkitekturfilosofi.

Portering av fixar sker manuellt när samma bugg hittas i bägge. Över tid divergerar produkterna: efter sex månader väntas direkt kodportering sällan vara möjlig.

### Arkitekturell relation

Nimloth Core *skulle kunna* använda Nimloth Core som data-ingest-lager i framtida integrationer. Men det är ingen nuvarande plan — det är en möjlighet som arkitekturen håller öppen. Tills en sådan integration är medvetet beslutad är de två produkterna fullt separerade.

### Filosofisk relation

Core och Flow delar samma grundantaganden:
- Event-driven från botten
- Lokal resiliens som designprincip
- PDL-korrekt från dag ett
- Öppna standarder (FHIR, openEHR, SNOMED CT, LOINC)
- Distributed by design

Men de skiljer sig i scope och djup:
- **Flow** förmedlar data. Den modellerar inte klinik — den flyttar den.
- **Core** modellerar klinik. Den äger data, semantik, workflows, beslutsstöd och lifecycle.

---

## 5. Val mellan Core och Flow

Använd denna matris som första filter:

| Om du vill... | → | Välj |
|---|---|---|
| Lyfta data från existerande källsystem till en FHIR-vy utan att ändra källorna | → | **Flow** |
| Demonstrera event-driven integration med CDC och Kafka | → | **Flow** |
| Ersätta punkt-till-punkt-integrationer i befintlig sjukvårdsarkitektur | → | **Flow** |
| Införa en modern clinical data lifecycle (openEHR + workflows) | → | **Core** |
| Bygga en ny journalplattform för primärvård | → | **Core** |
| Demonstrera hur en komplett plattform baserad på öppna standarder ser ut | → | **Core** |
| Införa CDS-regler baserade på CQL + PlanDefinition | → | **Core** |
| Exportera data till OMOP för forskning eller EHDS | → | **Core** |
| Integrera hela Inera-stacken (SITHS, HSA, Sambi, NPÖ, Pascal) | → | **Core** |
| Få en vårdcentral med flakigt nät att fungera resilient | → | **Core** |

### Undantagsfallet

Om du behöver *både* ingest-lager och full plattform: börja med Core. Core:s arkitektur kan absorbera Flows funktionalitet eller använda Flow som ingest-motor i en framtida integration. Det motsatta (Flow som skalar upp till plattform) är inte en projektbana — då är du i Core:s territorium.

---

## 6. Framtida möjliga relationer

Detta är inte en plan utan en notering för medvetenhet. Relationen mellan Core och Flow kan utvecklas:

**Scenario A — parallella produkter (nuläge).** Bägge lever vidare oberoende. Ingen teknisk koppling.

**Scenario B — Flow som Core:s ingest-lager.** När Core:s produktionsdata-ingest skalas upp kan Flow användas som ingest-motor. Flow producerar till Kafka-topics som Core konsumerar. Bägge behåller sin identitet men får ett naturligt integrationsmönster.

**Scenario C — Flow absorberas i Core.** Flow:s funktionalitet blir en komponent i Core. Flow-repot arkiveras. Kräver medveten beslut.

Nuvarande positionering: Scenario A. De andra hålls möjliga men inte förutsatta.

---

## 7. För tredje part som möter familjen

Om du inte är bekant med projekten och stöter på två repon med liknande namn:

- **Bägge är legitima**, inte en äldre/nyare version av samma sak.
- **Start med denna fil** i det repo du kom in via.
- **Använd val-matrisen i sektion 5** för att avgöra vilket repo du ska jobba med.
- **Fråga om du är osäker** — arkitekt är Anders Carlius.

Produkterna delar ingen run-time; du kan ha Flow installerad för befintlig integration och Core för nya workflows i samma region utan konflikt. De delar inga kodberoenden; en PR i ett repo påverkar inte det andra.

---

## 8. Historisk referens

För fullständig historik se:

- `v0.1-pre-fork`-tag i Nimloth Core-repot — state vid fork-tillfället
- Artikelserien *Nästa generations journalsystem* (18+1 artiklar) — det arkitektoniska fundamentet
- Ursprungliga VGR Datahub-dokumentationen som arkiverad referens i Flow-repot
