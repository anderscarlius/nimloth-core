# Arkitektur

Nimloth Core är en **event‑driven integrationshubb** som lyfter klinisk data från befintliga källsystem (Melior, AsynjaVisph, FlexLab, Klinisk Portal …) till en gemensam, FHIR‑kompatibel läsbild — utan att ändra källsystemen och utan att bygga punkt‑till‑punkt‑integrationer.

Det här dokumentet beskriver **lager för lager** vad som händer från att en sjuksköterska skriver ett blodtryck i Melior till att en akutläkare ser varningen "antikoagulerad — kontrollera INR" i sitt CDS‑kort på andra sidan Göteborg.

---

## 1. Lagerarkitektur

```
  ┌─────────────────────────────────────────────────────────────────┐
  │ Presentation      Dashboard (React) · FHIR‑klienter · EHR‑plugins │
  ├─────────────────────────────────────────────────────────────────┤
  │ Consumption       FHIR Facade R4 · CDS Hooks · Audit REST        │
  ├─────────────────────────────────────────────────────────────────┤
  │ Canonical Store   Core Postgres (materialiserade FHIR‑resurser)│
  ├─────────────────────────────────────────────────────────────────┤
  │ Transform         Semantisk anrikning — 7 domän‑mappningar        │
  ├─────────────────────────────────────────────────────────────────┤
  │ Event Bus         Apache Kafka (KRaft) · domän‑topics             │
  ├─────────────────────────────────────────────────────────────────┤
  │ Ingest            Kafka Connect · Debezium PostgreSQL connectors  │
  ├─────────────────────────────────────────────────────────────────┤
  │ Sources           Melior (SU) · AsynjaVisph (Närhälsan) · …       │
  └─────────────────────────────────────────────────────────────────┘
```

Varje lager har ett **tydligt kontrakt**: data flödar uppåt, frågor flödar nedåt via FHIR Facade. Inget lager pratar direkt med det lager som ligger två steg bort. Det ger oss tre kritiska egenskaper:

1. **Oberoende av källsystem** — Melior kan bytas ut, AsynjaVisph kan uppgraderas, en ny app kan läggas till; bara Ingest‑konfiguration och ev. en ny Transform‑mappare behöver röras.
2. **Re‑playbarhet** — råa CDC‑events finns kvar i Kafka i 90 dagar. Vi kan när som helst bygga om canonical‑store från scratch genom att re‑spela.
3. **Audit‑spårbarhet** — varje läsning via FHIR Facade producerar ett `core.audit.access`‑event. PDL‑kravet lever i consumption‑lagret, inte utspritt i varje källa.

---

## 2. Ingest — CDC från källsystemen

**Källsystemen exponerar inte API:er.** Men de är PostgreSQL‑databaser, och PostgreSQL har `wal_level=logical` — en binärlogg som Debezium kan abonnera på. Lösningen: lyssna på bin‑loggen, inte på applikationen.

```
Melior (PostgreSQL WAL)  →  Debezium connector  →  Kafka topic
                              (logical slot +       vgr.cdc.melior.su.public.<table>
                               snapshot)
```

Konkret konfiguration (`infra/debezium/register-connectors.sh`):

- `database.hostname`, `table.include.list` och `topic.prefix` parametriseras från env (`MELIOR_INSTANCE_ID`).
- `decimal.handling.mode=double` och `time.precision.mode=connect` — vi vill ha JSON‑number och epoch‑ms, inte base64‑kodade bytes och mikrosekundheltal.
- Publication + replication slot skapas automatiskt vid första start.

**Instans‑awareness från start:** en enskild Melior‑driftsättning har `MELIOR_INSTANCE_ID=su`. När VGR rullar ut Nimloth Core till NU, Skaraborg, och fler kör varje sjukhus sin egen connector med sitt eget `instance_id` och sin egen topic‑prefix. Centrala hubben slipper veta att "tabell 42 i databas B på host X är samma som tabell 7 i databas Y" — topic‑namnet bär identiteten.

**Ingest‑tjänsten** (`services/ingest/`) är en tunn Kafka‑consumer som forwardar råa CDC‑events + bifogar instance‑metadata. Den *kan* filtrera bort skräp‑operationer (tombstone‑events, DDL) men gör minimalt annars — den semantiska översättningen sker i nästa lager.

---

## 3. Event Bus — Kafka (KRaft)

**Apache Kafka** är event‑bussens ryggrad. KRaft‑läge (ingen ZooKeeper), en broker i PoC:n, men `replication.factor=3`‑taget i topic‑konfigurationen låter oss skala utan kodändringar.

Topics grupperas efter **lager**:

| Topic‑prefix | Retention | Partitioner | Exempel |
|---|---|---|---|
| `vgr.cdc.*` | 90 dagar | 3–6 | `vgr.cdc.melior.su.public.observations` |
| `core.clinical.*` | 30 dagar | 3–6 | `core.clinical.observation.vitals` |
| `core.admin.*` | 30 dagar | 3 | `core.admin.patient.registered` |
| `core.audit.access` | unlimited (compact+delete) | 6 | PDL‑logg |
| `core.system.*` | 7 dagar | 1 | felhanterade events, kvalitetsmetrics |
| `core.shared.*` | unlimited (compact) | 1–6 | SPAR, patient‑index, CDS‑regler |

**Namn‑konventionen** är viktig. Punkterna separerar **domän.subdomän.händelse**. Ett nytt team kan läsa topic‑listan och veta var de ska lyssna utan att läsa kod. `create-topics.sh` ägs i git och körs idempotent vid varje start.

`core.audit.access` är **compact+delete** — vi vill komprimera på `(patientId, accessedAt)` för att snabbt kunna svara på "vem har läst min journal" samtidigt som vi får sparat 7‑årshorisont för legal retention.

---

## 4. Transform — semantisk anrikning

Råa CDC‑events är **inte** domän‑events. En rad i `medications` kan vara en förskrivning, en dispensering, en stopprekommendation eller bara en rättning av dosenhet — strukturellt likadana i databasen, kliniskt helt olika.

`services/transform/` gör översättningen. **Sju mappningar**, en per domän‑event‑familj:

1. **Vitals** (`core.clinical.observation.vitals`) — blodtryck, puls, sat, temp.
2. **Lab results** (`core.clinical.lab.result`) — kem‑ och hematologisvar.
3. **Medications** (`core.clinical.medication.prescribed` / `.dispensed`).
4. **Procedures** (`core.clinical.procedure.completed`) — inkl. implantatdata.
5. **Encounters** (`core.clinical.encounter.started` / `.ended`).
6. **Conditions** (`core.clinical.condition.diagnosed`) — ICD‑10, SNOMED.
7. **Allergies** (`core.clinical.allergy.reported`).

Varje mappare gör tre saker:

- **Terminologi‑mappning**: lokala koder → SNOMED CT / LOINC / ATC / ICD‑10 där tabell finns (`services/transform/src/terminology.ts`).
- **Identifier‑normalisering**: personnummer trimmas, HSA‑id prefixas.
- **Patient‑cache**: för att kunna skicka `encounter.patient_ref` som `Patient/<id>` behöver transform veta vilka patienter som finns. Cache pre‑populeras från Melior‑ och Asynja‑DB **vid startup** — annars får vi en race där Debezium’s snapshot skickar `observations` före `patients` alfabetiskt, och transform hittar inga matchande patienter.

Mapparna är rena funktioner (`(cdcEvent, terminology, patientCache) → domainEvent`) och testas med Vitest (`services/transform/src/__tests__/mappings.test.ts`). Det betyder att du kan köra enhetstester utan att ha Kafka uppe.

**Kvalitetsmetrics** — varje event som saknar obligatoriska fält publiceras till `core.system.quality.metrics` istället för att droppas. Datakvalitets‑vyn i dashboarden visualiserar dessa (se `design_handoff/` → Datakvalitet‑vyn).

---

## 5. Canonical Store — core Postgres

FHIR Facades materializer (`services/fhir-facade/src/materializer.ts`) lyssnar på `core.clinical.*` och skriver till `core-db` i tabeller som speglar FHIR‑resurser:

```
fhir_patients                  (id, pnr, name_given, name_family, birth_date, …)
fhir_encounters                (id, encounter_ref, patient_ref, class, period_start, …)
fhir_observations              (id, patient_ref, code_system, code, value_numeric, …)
fhir_medications               (id, patient_ref, medication_code, status, dosage, …)
fhir_procedures                (id, patient_ref, code, performed_start, outcome, …)
fhir_conditions                (id, patient_ref, code, clinical_status, …)
fhir_allergies                 (id, patient_ref, substance, criticality, reaction, …)
fhir_diagnostic_reports        (id, patient_ref, based_on, result, …)
fhir_care_plans                (id, patient_ref, category, intent, period_start, …)
```

Varje tabell har `source_instance` (t.ex. `melior-su`) och — för encounter/procedure — `source_instance || '-' || encounter_id` som `encounter_ref`. Varför: Melior och Asynja har båda `encounter_id=1` i sina respektive databaser. Utan prefix får vi kollisioner i canonical store. Prefix ger oss global unik identitet.

Canonical store är **idempotent** — varje Kafka‑event genererar ett `INSERT … ON CONFLICT DO UPDATE`. Det betyder att re‑play från Kafka → canonical store alltid konvergerar oavsett ordning.

---

## 6. Consumption — FHIR Facade, CDS Hooks, Audit

### 6.1 FHIR Facade (`services/fhir-facade/`, port 3003)

Implementerar **FHIR R4** med 9 resurser: Patient, Encounter, Observation, MedicationStatement, Condition, AllergyIntolerance, Procedure, DiagnosticReport, CarePlan. Alla svarar på:

- `GET /fhir/r4/<Resource>?search-params` — bundle‑sökning.
- `GET /fhir/r4/<Resource>/{id}` — enskild resurs.
- `GET /fhir/r4/Patient/{id}/$everything` — hela klinisk bild i en bundle.

**FHIR_MODE:**

- `primary` (default) — läser från core‑Postgres. Används i central hubb och i edge‑noder när centrala Kafkan är up.
- `replica` — läser från lokal SQLite (edge‑cache). Aktiveras när edge‑noden detekterar offline. Kodvägen finns stubbad från Del 7; faktisk implementation fylls i Del 13.

Servern är **FHIR‑strikt på respons** men **headers‑strikt på PDL**: varje request kräver `X-User-HSA`, `X-User-Role`, `X-PDL-Care-Relation`, `X-PDL-Purpose`, `X-PDL-Care-Unit`. Saknas något → 403. Finns alla → request passerar och en audit‑post skickas till `core.audit.access`.

### 6.2 CDS Hooks (`services/cds-hooks/`, port 3004)

Implementerar **HL7 CDS Hooks 1.1**. Tre services:

- **core-anticoagulation** — triggar på `patient-view`, `medication-prescribe`, `order-select`. Läser patientens mediciner (`MedicationStatement`) → om ATC i {`B01AA03`, `B01AF*`, `B01AE*`} → "Kontrollera INR + interaktionsrisk". Speciellt stark signal för **Waran + NSAID** (`M01A*`) = kritiskt kort.
- **core-implant-alert** — triggar på `patient-view` i akuta kontext. Läser procedures → om implantat finns, returnera ett info‑kort med tillverkare, modell, lot‑nr, datum.
- **core-dvt-risk** — triggar på `order-select` (CT‑scan, ortopedisk kirurgi). Läser `Condition` → om historisk `I82.*` (venös trombos) → varning om förlängd profylax.

Varje service hämtar data via FHIR Facade. Cards följer CDS Hooks‑specifikationen (`indicator`, `summary`, `detail`, `source`, optional `suggestions`).

### 6.3 Audit (`services/audit/`, port 3005)

Enkel Kafka‑consumer som skriver `core.audit.access` → `core-db.audit_log`. REST‑API:

- `GET /audit/search?personnummer=&user=&from=&to=&purpose=` — filtrering enligt PDL 2008:355.
- `GET /audit/stats` — aggregerade siffror för systemstatus‑vyn.

**Audit är compact+delete på Kafka** och **append‑only i Postgres**. Det är två olika garantier: Kafka ger oss re‑play (bygga om audit‑DB från scratch om DB:n dör), Postgres ger oss legal retention (vi lovar att aldrig radera audit‑rader).

Nödöppning (break‑the‑glass) — `X-PDL-Purpose: EMERGENCY` + en `X-PDL-Emergency-Justification`‑header — går igenom samma flöde men markeras `emergency=true` i audit‑posten. UI:et (designmockup → "Åtkomstlogg" → amber rader) lyfter upp dessa för compliance‑granskning.

---

## 7. Dashboard

`services/dashboard/` är en **React 18 + Vite + Tailwind**‑app. Implementationen har sex sidor: **PatientSearch**, **PatientOverview**, **SystemStatus**, **Topology**, **CdsAlerts**, **AuditLog**. Hifi‑mockupen i `design_handoff/` listar sju mål‑vyer totalt — **Datakvalitet** och **Inställningar** är framtida arbete.

UI‑tekniken:

- `@tanstack/react-query` för FHIR‑fetch med caching och retry.
- Route‑baserad `react-router-dom`.
- Mönsterbaserad `fhir-client.ts` wrapper (`lib/fhir-client.ts`) som injicerar PDL‑headers.
- Host‑port **3010** (inte 3000) för att inte krocka med andra lokala dev‑servrar. Vite proxy routar `/api/fhir`, `/api/cds`, `/api/audit` + `/api/topology` (till replication:3007) + `/api/edge-fhir` (till edge-su:3003) till respektive backend.

**PatientOverview** har en `DataSourceIndicator` som visar vilka källsystem som bidrar med data (melior-su, asynja, edge-*) + om svaret kom från central hub eller edge-nodens lokala cache + en offline-badge när replication rapporterar att någon edge har tappat hub-anslutning.

**Topology** är en stylized SVG‑karta (viewBox 860×560) med central hub + edge‑noder med animerade dashed flödeslinjer (`flow` 1.6s) och pulserande ring på offline‑noder (`pulseRing` 1.8s). Datan kommer från `GET /topology` på replication-tjänsten — den konsumerar `core.system.edge.heartbeat` och håller senaste heartbeat per edge i minnet.

Designbryggan beskrivs fullständigt i [DESIGN.md](DESIGN.md).

---

## 8. Distribuerad topologi

I **distribuerat läge** (start via `./scripts/start-distributed.sh`) läggs per‑sjukhus edge‑noder + en central replikeringstjänst till:

```
 Sjukhus SU (edge-su)                      Central (Dalahubben)
┌───────────────────────┐                ┌──────────────────────┐
│ Lokal Kafka (KRaft)   │                │ Kafka (KRaft)        │
│  ↑ outbound consumer  │  edge-su.vgr.* │  ↓                   │
│                       │───────────────►│ Replication-tjänst   │
│ Edge-runtime:         │                │ • EdgeEventAggregator│
│ • FHIR server (R4)    │                │ • SharedDistributor  │
│   → SQLite-cache      │                │ • TopologyTracker    │
│ • CDS Hooks (3 regler)│  core.shared.*  │ • ConflictResolver   │
│ • OfflineDetector     │◄───────────────│  ↓                   │
│ • SyncManager (in+out)│  heartbeats    │ core.clinical.* (agg) │
│ • StatusReporter      │───────────────►│  ↓ materializer      │
└───────────────────────┘                │ Central FHIR-facade  │
  host: 4003/4004/4006                   │  → core-db        │
                                         └──────────────────────┘
                                           host: 3003/3007/3010
```

Komponenter (alla implementerade, Del 13–15):

- **Edge‑nod (`services/edge/`)** — `edge-runtime`, `offline-detector`, `sync-manager`, `fhir-cache` (SQLite), `status-reporter`, `fhir-server` (minimal FHIR R4 replica), `cds-server` (3 regler mot lokal cache). Körs som en container per sjukhus. Hydreras vid startup via HTTP-bootstrap mot central FHIR + löpande via Kafka `core.clinical.*` + `core.shared.patient-index`.
- **Replication‑tjänst (`services/replication/`)** — motsvarar Apache Kafka MirrorMaker 2 i produktion. KafkaJS-baserad men samma end-to-end-semantik.
  - `EdgeEventAggregator` — subscribar `edge-<id>.vgr.*`, strippar edge-prefix, republicerar centralt. Bevarar `x-edge-instance` + `x-edge-timestamp` headers och lägger till `x-aggregated-at` + `x-aggregation-lag-ms`. Pre-skapar edge-topics via admin-client så consumern aldrig crashar på saknade topics.
  - `SharedDataDistributor` — full-sync av `fhir_patients` → `core.shared.patient-index` var 5:e minut (compacted topic, keyed på personnummer) + delta-consumer på `core.admin.patient.registered`.
  - `TopologyTracker` — konsumerar `core.system.edge.heartbeat`, håller senaste heartbeat per instans i minnet, exponerar via `GET /topology`.
  - `ConflictResolver` — last-write-wins med källa-prioritet (melior-* > asynja > flexlab) + data-kompletthet.
- **Topologi‑vy** (dashboard `/topology`) — SVG‑karta med central hub i mitten + edge-noder runt om, animerade dashed flödeslinjer och pulserande ring på offline-noder. Hämtar data från `/api/topology` (Vite-proxy → replication:3007).

### Nätverks-topologi och port-mappning

Distribuerat läge använder två docker-nätverk:

- `nimloth-core` — simulerat VGR-wan; central-stacken + edge-su hänger här. Traffik edge↔central går via detta nätverk.
- `edge-su-local` — lokalt sjukhusnätverk mellan edge-su och edge-kafka-su. Är listat **först** i edge-su:s `networks`-lista så Docker följer det för port-forwarding — host-portarna (4003/4004/4006) behålls även vid `docker network disconnect nimloth-core edge-su`.

### Offline‑scenariot

`./scripts/simulate-network-failure.sh`:

1. **Disconnect:** `docker network disconnect nimloth-core edge-su` (ingen iptables — fungerar pålitligt på macOS och Linux).
2. **Detection:** OfflineDetector pingar `http://fhir-facade:3003/health` var 5:e sekund. Efter 3 missade pings (~15 s) emittar den `offline` → SyncManager växlar mode till `buffering`.
3. **Fortsatt drift:** Edge-runtime, FHIR-replica-server och CDS-server körs vidare via `edge-su-local`. Host-portar är kvar. Lokal trafik via `docker exec edge-su wget http://127.0.0.1:3003/...` fungerar alltid.
4. **Buffring:** SyncManagerns outbound-consumer hamnar i fail-path → `bufferedEvents++`. Lokala Kafka (retention -1) håller events tills vi kommer tillbaka.
5. **Reconnect:** `docker network connect nimloth-core edge-su` → första lyckade ping → `reconnected` → mode växlar till `replaying` → buffer flushas → efter ~10 s utan nya events → mode `realtime`.
6. **Topology-vyn** reflekterar allt via heartbeats → central `core.system.edge.heartbeat` → `TopologyTracker` → `/topology` → dashboard.

### Aggregator-flöde

När edge-su producerar till lokal Kafka (t.ex. en ny vital-observation):

```
edge-kafka-su:core.clinical.observation.vitals
    ↓ (outbound-consumer i SyncManager)
central Kafka:edge-su.core.clinical.observation.vitals
    ↓ (EdgeEventAggregator subscribar edge-*-topics)
central Kafka:core.clinical.observation.vitals   (prefix strippat)
    ↓ (central FHIR-facade materializer)
core-db:fhir_observations
```

Central FHIR blir därmed den enda kanoniska kopian — oavsett om eventet kom in via central Debezium eller via en edge-nod på andra sidan regionen.

---

## 9. Säkerhetsmodell

### 9.1 Autentisering

- PoC: HTTP‑headers (`X-User-HSA`, `X-User-Role`) — **ingen verifiering**.
- Produktion: Keycloak (container finns, port 8180) ger OIDC; `X-User-*` tas från JWT‑claims. HSA‑id valideras mot Inera:s HSA‑katalog.

### 9.2 Auktorisation (PDL 2008:355)

Varje FHIR‑anrop valideras:

1. **Vårdrelation** (`X-PDL-Care-Relation: true`) — klinikern måste ha aktiv vårdrelation till patienten.
2. **Syfte** (`X-PDL-Purpose`) — `CARE` (standard), `EMERGENCY` (nödöppning, utökad), `RESEARCH` (kräver medgivande).
3. **Vårdenhet** (`X-PDL-Care-Unit`) — HSA‑id för enheten där åtgärden sker.

Saknas vårdrelation + purpose ≠ EMERGENCY → 403. Emergency → request passerar men flaggas i audit.

### 9.3 Audit (PDL § 4)

Varje läsning → `core.audit.access`:

```json
{
  "timestamp": "2026-04-22T10:15:00Z",
  "user": "SE-DEMO-PHYSICIAN",
  "role": "PHYSICIAN",
  "action": "READ",
  "resource": "Patient/1/$everything",
  "patient_pnr": "19500315-2384",
  "care_unit": "SE2321000131-E000000000001",
  "purpose": "CARE",
  "emergency": false,
  "outcome": "success"
}
```

Retention: **oändlig i Kafka (compacted)**, **append‑only 7 år i Postgres**.

### 9.4 Datasäkerhet

- In‑transit: TLS i produktion (Traefik/nginx framför tjänsterna). PoC kör plaintext på docker‑nät.
- At‑rest: PostgreSQL‑volymer. Krypterade volymer vid deploy (LUKS / Synology DSM).
- Testdata är **syntetisk**. Personnumret `19500315-2384` är medvetet valt utanför Skatteverkets intervall.

---

## 10. Deploy‑modell

| Miljö | Arkitektur | Trädgårdsmur |
|---|---|---|
| Laptop (utveckling) | Docker Compose single‑node, arm64 | — |
| Intern test (CarliusFyra) | Docker Compose single‑node, x86_64 | NAS‑intern DMZ |
| Intern test distribuerat | Docker Compose + 1–2 edge‑noder | NAS + Mac minis |
| Produktion | Kubernetes (Helm‑charts, ej byggda i PoC) | VGR‑interna nät |

Multi‑arch Docker‑images byggs via `scripts/build.sh` (buildx + `core-builder`). Lokalt bygger `docker compose build` native arch. `docker-compose.yml` saknar medvetet `platforms:`‑nycklar — de hindrar default docker‑driver att köra compose up.

Konkreta deploy-instruktioner för CarliusFyra respektive VPS finns i [INSTALL.md](INSTALL.md) med Synology-specifika gotchas (docker-binär-path, `docker-compose` med bindestreck, `0.0.0.0`-portbinding, scp/sftp-ersättning via pipe).

---

## 11. Observabilitet

| Signal | Plats | Verktyg |
|---|---|---|
| Application logs | pino JSON → stdout per tjänst | `docker compose logs -f <service>` |
| Kafka consumer lag | Kafka UI | http://localhost:8080 |
| Health | `GET /health` per tjänst | curl |
| Systemstatus | dashboard → "Systemstatus" | — |
| Datakvalitet | `core.system.quality.metrics` → dashboard | — |
| Edge‑heartbeat | `core.system.edge.heartbeat` → topologivy | — |

Metrics‑endpoint i Prometheus‑format kan läggas till i Del 15.

---

## 12. Framtida arbete

Bortom Del 15:

- **Keycloak‑integration** — OIDC‑flow för både dashboard och FHIR Facade. Keycloak-containern kör redan på port 8180 men ingen tjänst verifierar JWT än.
- **SMART on FHIR launch** — så att existerande EHR:er (Take Care, Cosmic) kan starta vårt UI in‑context.
- **Avro / Schema Registry** — idag JSON, men Schema Registry är igång och klart att fylla.
- **Datakvalitetsdashboard** (hifi‑mockup → Datakvalitet‑vyn) som hämtar från `core.system.quality.metrics`.
- **Reconciliation‑engine** — regelbunden sanity‑check mellan källsystem och canonical store.
- **Fler edge-noder** — Del 14 förberedde `edge-skas`-skelettet i `docker-compose.distributed.yml` (kommenterat). Kräver separat `melior-db-skas` Postgres-instans för att vara meningsfullt.
- **Riktig MirrorMaker 2** — PoC-aggregatorn i `services/replication/` är KafkaJS-baserad. Produktionsvägen är `kafka-mirror-maker` med distribuerat offset-management.
- **Real Debezium på edge** — idag har edge-su ingen egen Debezium; local CDC-producer är förberedd i SyncManagern men oanvänd. Kräver ny Kafka Connect per edge + separat Melior-instans.
- **Helm‑charts** för Kubernetes‑deploy (ersätter compose i prod).

---

## Referenser

- [`docs/SCENARIO.md`](SCENARIO.md) — Fru Andersson, fullständig (single-node + distribuerat).
- [`docs/EXTENDING.md`](EXTENDING.md) — anslut ett nytt källsystem eller edge-nod.
- [`docs/DESIGN.md`](DESIGN.md) — designmockup → kod.
- [`docs/INSTALL.md`](INSTALL.md) — deploy till CarliusFyra / VPS.
- [`docs/QUICKDEMO.md`](QUICKDEMO.md) — 3 / 10 / 20-minuters demoguide.
- Pre-fork-arkivet (nimloth-docs): `VGR_Datahub_WorkPlan.md` (15‑stegsplanen) + `VGR_Datahub_ClaudeCode_Prompts_v2_Distributed.md` (källprompts, distribuerade tillägg).
- HL7 FHIR R4: https://hl7.org/fhir/R4/
- CDS Hooks 1.1: https://cds-hooks.hl7.org/1.1/
- PDL (2008:355): https://riksdagen.se/sv/dokument-lagar/dokument/svensk-forfattningssamling/patientdatalag-2008355_sfs-2008-355
