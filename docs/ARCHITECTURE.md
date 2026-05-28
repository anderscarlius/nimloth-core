# Arkitektur

> **Detta dokument beskriver Sprint 5-målbilden** — alltså hur Nimloth Core ser ut **efter** att utbyggnadsprompterna P1–P7 har körts. Sprint 0-baseline (den ärvda integrationsmotor-arkitekturen från Nimloth Flow) finns kvar som understruktur, men varje sektion noterar vilka tillägg P1–P7 inför.
>
> Aktuell sprint-status: se [`ROADMAP.md`](ROADMAP.md). Detaljerade implementationsplaner per sprint: se [`prompts/`](prompts/).

Nimloth Core är en **modulär journal- och vårdplattform** byggd kring:

- **openEHR** internt som kanonisk klinisk modell, **FHIR R4 SE** externt som utbytesformat.
- **Event-driven kärna** — Debezium CDC + Kafka som ryggrad, lika väl för operativa som analytiska flöden.
- **PDL som arkitekturell primitiv** — autentisering, vårdrelation, spärr och audit som dedicated services, inte efterhandskonstruktion.
- **Distribuerad resiliens** i tre nivåer (region-edge → care-unit-edge → client-edge), med 30 dagars offline-tolerans på vårdcentralsnivå.
- **Inera-stack-integrerad** — SITHS, HSA, Sambi, NPÖ och Pascal som strukturella komponenter.
- **Sekundäranvändning** via lakehouse (bronze/silver/gold) med OMOP CDM 5.4 som analytiskt utbytesformat.

Det här dokumentet beskriver lager för lager vad som händer från att en sjuksköterska skriver ett blodtryck i Melior, via openEHR-template på vårdcentralen, till en akutläkare som ser CDS-varningen "antikoagulerad — kontrollera INR" på SU Östra.

---

## 1. Lagerarkitektur

```
  ┌──────────────────────────────────────────────────────────────────────┐
  │ Presentation       Dashboard (React) · FHIR-klienter · EHR-plugins    │
  │                    SMART on FHIR launch (Beyond)                       │
  ├──────────────────────────────────────────────────────────────────────┤
  │ Consumption        FHIR Facade R4 SE · CDS Hooks (CQL-runner) · Audit │
  │                    Secondary-data API (OMOP)                           │
  ├──────────────────────────────────────────────────────────────────────┤
  │ Identity & Catalog HSA · SITHS · Keycloak (OIDC + cert federation)    │
  │   ↕ PDL Decision   PDL decision service (vårdrelation/spärr/audit)    │
  ├──────────────────────────────────────────────────────────────────────┤
  │ Canonical          openEHR (EHRbase)  ↔  FHIR-materialisering         │
  │                    AQL ↔ SQL-broar via FHIR Facade                     │
  ├──────────────────────────────────────────────────────────────────────┤
  │ Analytics          Lakehouse: bronze (CDC) → silver (clinical) →      │
  │                    gold (OMOP CDM 5.4)                                 │
  ├──────────────────────────────────────────────────────────────────────┤
  │ Transform          7 domän-mappare + Mapping-assistant (AI-assisted)  │
  │                    Terminologitjänst (Snowstorm + HAPI + cache/fallback)│
  ├──────────────────────────────────────────────────────────────────────┤
  │ Event Bus          Apache Kafka (KRaft) — domän-topics, edge-aggreg.  │
  ├──────────────────────────────────────────────────────────────────────┤
  │ Ingest             Kafka Connect · Debezium PG-connectors · NPÖ-/     │
  │                    Pascal-clients · openEHR-composer                   │
  ├──────────────────────────────────────────────────────────────────────┤
  │ Sources            Melior · AsynjaVisph · FlexLab · Klinisk Portal ·  │
  │                    NPÖ · Pascal                                        │
  └──────────────────────────────────────────────────────────────────────┘

  Resiliens-skikt (parallellt med stacken):
   • Region-edge        — sjukhus-edge med lokal Kafka + FHIR-replica
   • Care-unit-edge     — vårdcentralsnivå (SQLite + HTTP-sync, 30d offline)
   • Client-edge        — PWA (IndexedDB + Service Worker, Beyond)
```

Varje lager har ett **tydligt kontrakt**: data flödar uppåt, frågor flödar nedåt via FHIR Facade. Inget lager pratar direkt med det lager som ligger två steg bort. Det ger fyra kritiska egenskaper:

1. **Oberoende av källsystem** — Melior kan bytas ut, AsynjaVisph uppgraderas, en ny app läggas till; bara Ingest-konfig och ev. ny Transform-mappare behöver röras.
2. **Re-playbarhet** — råa CDC-events finns kvar i Kafka 90 dagar och i lakehouse-bronze obegränsat. Vi kan när som helst bygga om canonical-store från scratch.
3. **Audit-spårbarhet** — varje läsning via FHIR Facade producerar ett `core.audit.access`-event. PDL-kravet lever som decision service, inte utspritt i varje endpoint.
4. **Sekundäranvändning** — analytiska frågor går aldrig mot operativa system. Lakehouse-spåret konsumerar samma event-bus utan att belasta canonical store.

---

## 2. Ingest — CDC från källsystemen

**Källsystemen exponerar inte API:er.** Men de är PostgreSQL-databaser, och PostgreSQL har `wal_level=logical` — en binärlogg som Debezium kan abonnera på. Lösningen: lyssna på bin-loggen, inte på applikationen.

```
Melior (PostgreSQL WAL)  →  Debezium connector  →  Kafka topic
                              (logical slot +       vgr.cdc.melior.<inst>.public.<table>
                               snapshot)
```

Konkret konfiguration (`infra/debezium/register-connectors.sh`):

- `database.hostname`, `table.include.list` och `topic.prefix` parametriseras från env (`MELIOR_INSTANCE_ID`).
- `decimal.handling.mode=double` och `time.precision.mode=connect` — vi vill ha JSON-number och epoch-ms.
- Publication + replication slot skapas automatiskt vid första start.

**Instans-awareness från start:** varje Melior-driftsättning har eget `MELIOR_INSTANCE_ID`. Centrala hubben slipper veta att "tabell 42 i databas B på host X är samma som tabell 7 i databas Y" — topic-namnet bär identiteten.

> **Sprint 3 (P5) inför:** `services/npo-client/` och `services/pascal-client/` som Ingest-komponenter. NPÖ pollas på schema (delta-fönster) och publicerar till `core.cdc.npo.*`. Pascal queryas läkemedel-vid-behov och cachas till `core.cdc.pascal.*`. Inera-stacken kräver SITHS-cert för båda flödena.

---

## 3. Event Bus — Kafka (KRaft)

**Apache Kafka** är event-bussens ryggrad. KRaft-läge (ingen ZooKeeper), en broker i PoC, skalas till `replication.factor=3` i produktion utan kodändring.

Topics grupperas efter **lager**:

| Topic-prefix | Retention | Partitioner | Exempel |
|---|---|---|---|
| `vgr.cdc.*` | 90 dagar | 3–6 | `vgr.cdc.melior.su.public.observations` |
| `core.cdc.npo.*` | 90 dagar | 3 | `core.cdc.npo.medication-history` (Sprint 3) |
| `core.cdc.pascal.*` | 30 dagar | 1 | `core.cdc.pascal.dispense` (Sprint 3) |
| `core.clinical.*` | 30 dagar | 3–6 | `core.clinical.observation.vitals` |
| `core.admin.*` | 30 dagar | 3 | `core.admin.patient.registered` |
| `core.audit.*` | unlimited (compact+delete) | 6 | `core.audit.access`, `core.audit.cds`, `core.audit.mapping` |
| `core.system.*` | 7 dagar | 1 | felhanterade events, kvalitetsmetrics, edge-heartbeat |
| `core.shared.*` | unlimited (compact) | 1–6 | SPAR, patient-index, CDS-regler, terminologi |
| `core.lakehouse.*` | 30 dagar | 1 | bronze/silver/gold-checkpoint-events (Sprint 4) |

**Namn-konventionen** är viktig. Punkterna separerar **domän.subdomän.händelse**. `infra/kafka/create-topics.sh` ägs i git och körs idempotent vid varje start.

> **Sprint 5 (P7) inför:** `core.audit.cds` (varje CDS-evaluering loggas) och `core.system.cds.diff` (parallelldrift hårdkodad-vs-CQL-resultat). När CDS-migreringen är klar (Beyond Sprint 5) loggas bara CQL-utfallen.

---

## 4. Transform — semantisk anrikning

Råa CDC-events är **inte** domän-events. En rad i `medications` kan vara förskrivning, dispensering, stopprekommendation eller dosrättning — strukturellt likadana, kliniskt helt olika.

`services/transform/` gör översättningen. **Sju mappningar**, en per domän-event-familj:

1. **Vitals** — blodtryck, puls, sat, temp.
2. **Lab results** — kem- och hematologisvar.
3. **Medications** — `prescribed` / `dispensed`.
4. **Procedures** — inkl. implantatdata.
5. **Encounters** — `started` / `ended`.
6. **Conditions** — ICD-10, SNOMED.
7. **Allergies**.

Varje mappare gör tre saker:

- **Terminologi-mappning** (Sprint 1: via tjänst, se §4.5 nedan).
- **Identifier-normalisering** — personnummer trimmas, HSA-id prefixas.
- **Patient-cache** — för `encounter.patient_ref = Patient/<id>` behöver Transform veta vilka patienter som finns. Pre-populeras från Melior och Asynja vid startup för att undvika ordnings-race med Debezium-snapshot.

Mapparna är rena funktioner och testas med Vitest utan Kafka uppe.

**Kvalitetsmetrics** — varje event som saknar obligatoriska fält publiceras till `core.system.quality.metrics` istället för att droppas. Datakvalitets-vyn i dashboarden visualiserar dessa.

> **Sprint 2 (P4) inför:** `services/mapping-assistant/` som AI-assisterad mapping-utvecklare — propose, observe, ask. Se §10 för fullständig beskrivning.

### 4.5 Terminologitjänst — `services/terminology/` (Sprint 1, P1)

Sprint 0 har hårdkodade lookup-tabeller (`services/transform/src/terminology.ts`) för SU-LOCAL → SNOMED och liknande. Det fungerar för Fru Andersson men skalar inte.

Sprint 1 ersätter detta med:

- **Snowstorm-lite** — SNOMED CT subset (~100 MB) på port 8090.
- **HAPI FHIR Terminology** — LOINC + ICD-10-SE på port 8091.
- **Tunn proxy `services/terminology/`** med Redis/in-memory-cache (TTL 24h) på port 3008. Endpoints:
  - `POST /translate` — `{source, target, code}` → `{code, display, system}`
  - `POST /expand` — `{url}` ValueSet canonical → `Parameters`-bundle
  - `POST /lookup` — `{system, code}` → `{display, designations}`
- **Fallback** — när Snowstorm/HAPI är nere används JSON-snapshot från `data/terminology-fallback.json`. Demot fungerar oavsett upstream-status.

Transform-mapparna anropar `terminologyClient.translate(...)` istället för lokala lookups. Lokala tabeller behålls som fallback-data.

---

## 5. Canonical Store — openEHR + FHIR-materialisering

Sprint 0 har **enbart FHIR-materialisering i Postgres**. Sprint 2 inför **openEHR som primärt kanoniskt lager** parallellt — FHIR-tabellerna materialiseras nu från openEHR-compositions, inte direkt från Kafka.

### 5.1 FHIR-materialisering (Sprint 0, oförändrad signatur)

FHIR Facades materializer (`services/fhir-facade/src/materializer.ts`) lyssnar på `core.clinical.*` och skriver till `core-db`:

```
fhir_patients            (id, pnr, name_given, name_family, birth_date, …)
fhir_encounters          (id, encounter_ref, patient_ref, class, period_start, …)
fhir_observations        (id, patient_ref, code_system, code, value_numeric, …)
fhir_medications         (id, patient_ref, medication_code, status, dosage, …)
fhir_procedures          (id, patient_ref, code, performed_start, outcome, …)
fhir_conditions          (id, patient_ref, code, clinical_status, …)
fhir_allergies           (id, patient_ref, substance, criticality, reaction, …)
fhir_diagnostic_reports  (id, patient_ref, based_on, result, …)
fhir_care_plans          (id, patient_ref, category, intent, period_start, …)
```

Varje tabell har `source_instance` och `encounter_ref = source_instance || '-' || encounter_id` — global unik identitet. Idempotent via `INSERT … ON CONFLICT DO UPDATE`.

### 5.2 openEHR parallellt kanoniskt lager (Sprint 2, P3)

`services/openehr-composer/` konsumerar `core.clinical.*` och skriver till **EHRbase** — en open source openEHR clinical data repository på Postgres. Mappningen sker via **7 templates** baserade på internationella CKM-arketyper:

| Domän-event | openEHR-template |
|---|---|
| `core.clinical.observation.vitals` | `vital_signs.v2` |
| `core.clinical.lab.result` | `laboratory_test_result.v1` |
| `core.clinical.medication.prescribed` | `medication_management.v1` |
| `core.clinical.procedure.completed` | `procedure.v1` |
| `core.clinical.encounter.started` | `encounter.v1` |
| `core.clinical.condition.diagnosed` | `problem_diagnosis.v1` |
| `core.clinical.allergy.reported` | `adverse_reaction_risk.v1` |

EHRbase exponerar AQL (Archetype Query Language) över sin REST-API. FHIR Facade har en `CANONICAL_STORE`-flagga med tre lägen:

- `CANONICAL_STORE=postgres` — läser från `fhir_*`-tabeller som tidigare. P3.3-default; behåll för miljöer som inte behöver paritetsmätning.
- `CANONICAL_STORE=openehr` — översätter FHIR-queries till AQL och hämtar från EHRbase. Översättning sker i ett tunt **AQL-broker-lager**.
- `CANONICAL_STORE=both` — **default sedan P3.4 (2026-05-02)**. Postgres är primär läsväg, openEHR används parallellt för paritetsmätning. Krav för `ParityRunner` och `<ParityTrend />` dashboard-vy.

**Paritet:** `POST /facade/parity/run` triggar en mätning, `GET /facade/parity/history` returnerar mätserien, `<ParityTrend />` i dashboard visualiserar trend över tid. Veckovis schemalagd körning söndag 02:00 UTC. Se [P3.4-REPORT.md](../services/fhir-facade/P3.4-REPORT.md) för detaljer.

> **Varför parallellt och inte ersättning?** openEHR är arkitekturellt rätt för svensk vård men FHIR-materialisering är pragmatisk för CDS Hooks och dashboard. Genom att köra båda får vi rätt arkitektur internt och rätt API externt. Beyond Sprint 5 kan FHIR-materialiseringen göras slimmare (bara projection-views) när AQL-broker mognat.

### 5.3 Lakehouse-spåret (Sprint 4, P6)

Parallellt med canonical store finns det **analytiska spåret** — för forskning, kvalitetsregister och EHDS:

```
core.clinical.* / vgr.cdc.*           (samma event-bus)
        ↓                                       ↓
┌──────────────────────┐         ┌──────────────────────────┐
│ services/lakehouse-  │         │ services/lakehouse-      │
│   bronze/            │         │   silver/                │
│ Konsumerar ALL CDC   │         │ Konsumerar clinical-     │
│ → MinIO/Iceberg      │         │ events per domän         │
│ Parquet, append      │         │ → silver_observations/   │
│                      │         │   silver_medications/…   │
└──────────────────────┘         └──────────────────────────┘
                                              ↓
                                  ┌──────────────────────────┐
                                  │ services/lakehouse-gold- │
                                  │   omop/                  │
                                  │ silver → OMOP CDM 5.4    │
                                  │ ATHENA-vocabulary laddad │
                                  └──────────────────────────┘
```

- **MinIO** + Iceberg REST catalog som object store (S3-kompatibel).
- **Bronze** — råa CDC-events i Parquet, append-only.
- **Silver** — clinical events normaliserade per domän, partitionerat på datum + patient.
- **Gold (OMOP)** — `person`, `observation`, `drug_exposure`, `condition_occurrence`, `procedure_occurrence` enligt OMOP CDM 5.4.

Sekundär endpoint: `GET /api/v1/secondary-data/omop` — kräver `X-PDL-Purpose: RESEARCH` (PDL-decision service nekar `CARE`-syfte mot detta endpoint).

**Kontrakt-separation:** CDS Hooks och dashboard läser **aldrig** från lakehouse. Lakehouse är read-only för analytiker; operativa flöden går via canonical store.

---

## 6. Consumption — FHIR Facade, CDS Hooks, Audit, Secondary

### 6.1 FHIR Facade (`services/fhir-facade/`, port 3003)

Implementerar **FHIR R4 SE** med 9 resurser: Patient, Encounter, Observation, MedicationStatement, Condition, AllergyIntolerance, Procedure, DiagnosticReport, CarePlan. Alla svarar på:

- `GET /fhir/r4/<Resource>?search-params` — bundle-sökning.
- `GET /fhir/r4/<Resource>/{id}` — enskild resurs.
- `GET /fhir/r4/Patient/{id}/$everything` — hela klinisk bild i en bundle.

**FHIR_MODE:**

- `primary` (default) — läser från `CANONICAL_STORE` (postgres, openehr eller both).
- `replica` — läser från lokal SQLite (region-edge eller care-unit-edge).

**Sprint 3 (P5) inför PDL decision service** istället för enkel header-validering. Se §7.

### 6.2 CDS Hooks (`services/cds-hooks/`, port 3004)

Sprint 0 har **3 hårdkodade regler** (`core-anticoagulation`, `core-implant-alert`, `core-dvt-risk`).

Sprint 5 (P7) inför **CQL-runner**:

- `cds/plans/` — 3 `PlanDefinition`-resurser (HL7 CDS Hooks 1.1) + 3 `Library`-resurser med CQL.
- `services/cds-hooks/src/cql-runner.ts` baserad på `cql-execution`. CQL→ELM-kompilering pre-byggs vid container-build.
- **Parallelldrift** Sprint 5 → Beyond: hårdkodad regel + CQL-version körs båda. Hårdkodat svar är auktoritativt mot klienten. Diff loggas till `core.system.cds.diff`. När diff-topic visat 0 avvikelser i 30 dagar bryts hårdkodade regler ut.

Varje CDS-evaluering loggas till `core.audit.cds` (vem fick vilket kort, baserat på vilken regel-version). Dashboardens CdsAlerts-vy visar parallelldrift-status.

### 6.3 Audit (`services/audit/`, port 3005)

Sprint 0: enkel Kafka-consumer som skriver `core.audit.access` → `core-db.audit_log`. REST:

- `GET /audit/search?personnummer=&user=&from=&to=&purpose=`
- `GET /audit/stats`

**Audit är compact+delete på Kafka** (re-play) och **append-only i Postgres** (legal retention 7 år).

> **Sprint 2 (P4) inför `core.audit.mapping`** — varje Mapping-assistant-anrop loggas (modellversion, prompt-hash, mänsklig granskare). **Sprint 5 (P7) inför `core.audit.cds`**. Audit-tjänsten konsumerar nu fyra audit-topics (access, cds, mapping + reserverat plats för framtida).

### 6.4 Secondary-data API (Sprint 4)

`GET /api/v1/secondary-data/omop?cohort=…&from=…&to=…` returnerar OMOP-shaped JSON ur lakehouse-gold. PDL-checkpoint kräver `X-PDL-Purpose: RESEARCH` + `X-Research-Project-ID` (loggas i audit).

Inte FHIR-formaterat — sekundäranvändning har egna kontrakt enligt OHDSI/EHDS.

---

## 7. Identity & Catalog Layer + PDL decision service (Sprint 3, P5)

Sprint 0 har en **enkel header-baserad PDL-validering** i FHIR Facade middleware. Sprint 3 lyfter detta till en dedicated stack:

```
                      ┌─────────────────────────────────────────┐
   Klient (browser/   │ Keycloak (port 8180)                    │
   curl/EHR-plugin)   │  • OIDC realm "nimloth-core"            │
        ↓             │  • SITHS cert federation                │
   ┌──────────┐       │  • Sambi IdP federation (mock)          │
   │ FHIR-    │       │  • JWT med HSA-id, roll, vårdenhet      │
   │ Facade   │ ───→  └──────────────────┬──────────────────────┘
   │ middleware│                         │
   └────┬─────┘                          ↓
        │            ┌────────────────────────────────────────┐
        │            │ services/hsa/  (testkatalog 20 enheter,│
        │            │  50 personer; NPÖ-protokoll bakom)     │
        │            └────────────────────────────────────────┘
        │            ┌────────────────────────────────────────┐
        └─→  →  →  → │ services/pdl/  (decision service)      │
                     │  Input: {actor, patient, action,       │
                     │          care-unit, purpose}           │
                     │  Logik: vårdrelation? spärr?           │
                     │         emergency? quality-registry?   │
                     │  Output: {decision, reason, audit}     │
                     └────────────────────────────────────────┘
```

**`AUTH_MODE`-flagga:**

- `AUTH_MODE=dev` (Sprint 0 + dev) — header-baserat, ingen verifiering.
- `AUTH_MODE=siths` (Sprint 3+) — kräver giltig client-cert; HSA-id hämtas från cert + JWT från Keycloak.

PDL-tjänsten exponerar:

- `POST /pdl/decide` — synkron beslutspunkt anropad av FHIR Facade per request.
- `GET /pdl/blocks/{personnummer}` — patientens spärr-status.
- `POST /pdl/care-relation` — registrera/avsluta vårdrelation.

Tjänsten paketeras också som **library** (`@nimloth-core/pdl-lib`) så care-unit-edge kan köra PDL-besluten lokalt offline.

**NPÖ + Pascal:** `services/npo-client/` (synkar journalanteckningar och diagnoser från andra vårdgivare) och `services/pascal-client/` (läkemedelsförteckning). Bägge respekterar `core.shared.spar-register` (medborgarens samtyckesinställning).

---

## 8. Resiliens — tre nivåer av edge

Sprint 0 har en nivå (sjukhus-edge). Sprint 5-målbilden har tre, nedan ordnade efter mognad:

### 8.1 Region-edge / sjukhus-edge (Sprint 0, befintlig)

`services/edge/` — körs som container per sjukhus (t.ex. `edge-su`, `edge-skas`):

- Lokal Kafka (KRaft, retention `-1` så events buffras offline).
- FHIR-replica-server med SQLite-cache (`fhir-cache.db`).
- CDS Hooks (3 regler) mot lokal cache.
- OfflineDetector + SyncManager (in/out) + StatusReporter.
- Hydreras via HTTP-bootstrap mot central FHIR + Kafka `core.clinical.*` + `core.shared.patient-index`.

**Offline-tolerans:** timmar till dagar. Hårdvara: industri-PC eller Mac mini.

### 8.2 Care-unit-edge / vårdcentralsnivå (Sprint 1, P2)

`services/care-unit-edge/` — lättviktsruntime för enskilda vårdcentraler eller mottagningar utan dedikerad hårdvara:

- Bara SQLite (ingen lokal Kafka).
- HTTP-sync mot central via `POST /sync/push`, `GET /sync/pull?since=…`, `POST /sync/heartbeat`.
- Konfliktdetektering: optimistic concurrency med `version`-fält. Conflicts loggas + visas i dashboard för manuell granskning.
- PDL-lib körs lokalt (offline-besluten loggas och syncas vid reconnect).

**Offline-tolerans:** upp till 30 dagar. Hårdvara: vanlig kontors-PC.

> **Demo:** `simulate-vardcentral-offline.sh` simulerar Bengtsfors vårdcentral 4h offline, med fortsatt klinisk funktion + clean reconnect.

### 8.3 Client-edge / PWA (Beyond Sprint 5)

PWA med IndexedDB + Service Worker — för mobil och ambulans. Inte i Sprint 1–5; planeras post-1.0.0.

### 8.4 Sjukhus-edge — distribuerat läge i detalj

```
 Sjukhus SU (edge-su)                      Central
┌───────────────────────┐                ┌──────────────────────┐
│ Lokal Kafka (KRaft)   │                │ Kafka (KRaft)        │
│  ↑ outbound consumer  │  edge-su.core.*│  ↓                   │
│                       │───────────────►│ Replication-tjänst   │
│ Edge-runtime:         │                │ • EdgeEventAggregator│
│ • FHIR server (R4)    │                │ • SharedDistributor  │
│   → SQLite-cache      │                │ • TopologyTracker    │
│ • CDS Hooks (3 regler)│  core.shared.* │ • ConflictResolver   │
│ • OfflineDetector     │◄───────────────│  ↓                   │
│ • SyncManager (in+out)│  heartbeats    │ core.clinical.* (agg)│
│ • StatusReporter      │───────────────►│  ↓ materializer      │
└───────────────────────┘                │ Central FHIR-facade  │
  host: 4003/4004/4006                   │  → core-db           │
                                         └──────────────────────┘
                                           host: 3003/3007/3010
```

Replication-tjänsten (`services/replication/`) motsvarar Apache Kafka MirrorMaker 2 i produktion. KafkaJS-baserad i PoC men samma end-to-end-semantik:

- `EdgeEventAggregator` — subscribar `edge-<id>.core.*`, strippar prefix, republicerar centralt. Bevarar `x-edge-instance` + `x-edge-timestamp` headers, lägger till `x-aggregated-at` + `x-aggregation-lag-ms`.
- `SharedDataDistributor` — full-sync av `fhir_patients` → `core.shared.patient-index` var 5:e minut + delta-consumer.
- `TopologyTracker` — konsumerar `core.system.edge.heartbeat`, exponerar via `GET /topology`.
- `ConflictResolver` — last-write-wins med källa-prioritet (melior > asynja > flexlab) + datakompletthet.

### 8.5 Nätverks-topologi och offline-scenariot

Distribuerat läge använder två docker-nätverk:

- `nimloth-core` — simulerat regionnät; central + alla edge:s. Trafik edge↔central går här.
- `<edge>-local` — lokalt sjukhusnät (t.ex. `edge-su-local`) mellan edge-runtime och edge-Kafka. Listas **först** i edge:s `networks` så Docker följer det för port-forwarding — host-portarna behålls även vid `docker network disconnect nimloth-core edge-su`.

`./scripts/simulate-network-failure.sh`:

1. **Disconnect:** `docker network disconnect nimloth-core edge-su`.
2. **Detection:** OfflineDetector pingar var 5:e sekund. Efter 3 missade (~15 s) → `offline` → `buffering`.
3. **Fortsatt drift:** Edge-runtime, FHIR-replica, CDS-server kör vidare via `edge-su-local`. Lokal trafik fungerar.
4. **Buffring:** SyncManager outbound fail-path → lokala Kafka håller events (retention -1).
5. **Reconnect:** `docker network connect …` → `replaying` → buffer flushas → `realtime` efter ~10 s ro.
6. **Topology-vyn** reflekterar allt via heartbeats.

---

## 9. Dashboard

`services/dashboard/` är en **React 18 + Vite + Tailwind**-app. Sju mål-vyer plus två som tillkommer i sprintarna:

1. **PatientSearch** — sök per personnummer.
2. **PatientOverview** — Banner, AllergyCard, CdsStack, Tabs (Tidslinje, Läkemedel, Labb, Operationer, Diagnoser, Vitala, Vårdkontakter).
3. **SystemStatus** — health per tjänst.
4. **Topology** — SVG-karta med region-edge + care-unit-edge.
5. **CdsAlerts** — CDS-evaluerings-historik + parallelldrift-status (Sprint 5).
6. **AuditLog** — PDL-loggsökning.
7. **Mappings** (Sprint 2) — Mapping-assistant godkänn/avvisa-flöde.
8. **Datakvalitet** (Sprint 4) — bronze/silver/gold-status + dataquality-metrics.

**Fas 2/3 — egna full-höjd-vyer utanför standard-Layout** (proxar till de
co-lokaliserade cf4-tjänsterna):

9. **ComposeDemo** (`/compose-demo`, Fas 2) — sandlådekatalog över de 6 ankarpersonerna; mätvärdestrend-komponent mot `aql-template-service` (cf4:11402).
10. **MedReview** (`/med-review`, Fas 3) — AI-medicineringsgenomgång, tre-kolumns streaming (patientdata | fynd+narrativ | audit-tidslinje) via SSE mot `med-review` (cf4:11403). Visar S1-validering + ej-medicinteknisk-märkning.

UI-tekniken:

- `@tanstack/react-query` för FHIR-fetch.
- `react-router-dom` för routing.
- `lib/fhir-client.ts` injicerar PDL-headers (Sprint 0) eller Keycloak-JWT (Sprint 3).
- Host-port **3010** för att inte krocka med dev-servrar på 3000.

`PatientOverview.DataSourceIndicator` visar källsystem (melior-su, asynja, edge-*) + central-vs-edge-svar + offline-badge när någon edge är offline.

`Topology` är en stylized SVG-karta (viewBox 860×560) med animerade dashed-linjer (`flow` 1.6s) och pulserande ring på offline-noder (`pulseRing` 1.8s). Datan kommer från `GET /topology` på replication.

Designbryggan beskrivs i [DESIGN.md](DESIGN.md).

---

## 10. Mapping-assistant — AI-assisterad integration (Sprint 2, P4)

Att handkoda mappare i `services/transform/` är tidskrävande och felbenäget. Sprint 2 inför **`services/mapping-assistant/`** som tre flöden:

### 10.1 Propose

`POST /mappings/propose` — input: rå CDC-event från en ny källtabell. Output: föreslagen TypeScript-mapper-fil (i `services/transform/src/mappings/proposed/`) + förslag på terminologi-mappningar + kvalitets-flaggor.

Drivs av Claude API. Prompten innehåller:

- Schema från Schema Registry (Avro/JSON Schema).
- Exempel-events (samplade från Kafka).
- Befintliga mappers som pattern-bibliotek.
- openEHR-template-beskrivningar.

CLI: `pnpm mapper:propose --topic=vgr.cdc.flexlab.public.results`.

### 10.2 Observe

Bakgrundstjänst som läser `core.system.quality.metrics` och letar efter okända koder, missade transforms, datakvalitetsfel. Föreslår mapping-justeringar baserat på faktiskt observerat dataflöde.

### 10.3 Ask

`POST /mappings/ask` — fri-textfråga om mapping-beslut, t.ex. "Vad ska `Melior.observations.recorded_by_role='AUS'` mappa till i FHIR?". Returnerar förslag + motivering + relaterade mappers.

### 10.4 Audit och godkännande

Allt loggas till `core.audit.mapping` (modellversion, prompt-hash, granskare). Mapping-assistant **publicerar aldrig direkt till canonical store** — alla förslag måste godkännas av människa via dashboardens `/mappings`-vy. Detta är en tidsbesparing, inte en risk-amplifier.

### 10.5 Plattformskärnor

Mapping-assistant står på två generella plattformskomponenter införda i Sprint 2 — båda är tänkta att tjäna även Sprint 3+ (Sambi/PDL, CDS-text-generering):

- **`packages/model-router/`** — delad lib som dirigerar LLM-anrop. Tjänsten ber routern utföra en logisk task (t.ex. `mapping.propose`) med en deklarerad känslighetsnivå (`schema-only`, `pii`, `phi`); routern väljer rätt provider+modell baserat på YAML-config. PHI-tasks tvingas till on-premise (Ollama). Cloud (Anthropic) tillåts bara för schema-only och public. Se [docs/architecture/model-routing.md](architecture/model-routing.md).

- **Signed prompt-manifest** — varje prompt-template har en SHA256 i `prompts/manifest.json` som verifieras vid service-startup. Service vägrar starta vid mismatch. Per förslag persisteras `template_sha + prompt_hash` så proveniens är spårbar även om manifest senare ändras. Se [docs/architecture/prompt-signing.md](architecture/prompt-signing.md).

---

## 11. Säkerhetsmodell

### 11.1 Autentisering

- Sprint 0 (`AUTH_MODE=dev`): HTTP-headers, ingen verifiering.
- Sprint 3 (`AUTH_MODE=siths`): SITHS client-cert (mTLS) + Keycloak OIDC. JWT-claims fyller `X-User-*`-fält. HSA-id valideras mot `services/hsa/` testkatalog.

### 11.2 Auktorisation (PDL 2008:355)

PDL decision service (`services/pdl/`) är arkitekturell primitiv. Varje FHIR-anrop:

1. **Vårdrelation** — aktiv `care_relation` mellan klinikern och patienten?
2. **Syfte** — `CARE` (standard), `EMERGENCY` (break-the-glass, utökad), `RESEARCH` (kräver projekt-ID + samtycke), `QUALITY_REGISTRY`.
3. **Vårdenhet** — HSA-id för enheten där åtgärden sker.
4. **Spärr** — har patienten spärrat sig från denna vårdgivare?

Beslut: `PERMIT` / `DENY` / `PERMIT_WITH_OBLIGATIONS` (t.ex. emergency = permit + extended audit).

### 11.3 Audit (PDL § 4)

Varje läsning → `core.audit.access`. Varje CDS-evaluering → `core.audit.cds`. Varje mapping-assistant-anrop → `core.audit.mapping`. Strukturerade JSON-events; retention oändlig i Kafka (compacted) + append-only 7 år i Postgres.

Nödöppning markeras `emergency=true` + obligatorisk `X-PDL-Emergency-Justification`-header. UI lyfter dessa för compliance-granskning.

### 11.4 Datasäkerhet

- In-transit: TLS via Traefik/nginx i produktion. PoC plaintext på docker-nät.
- At-rest: PostgreSQL-volymer med diskkryptering (LUKS / Synology DSM).
- All testdata är **syntetisk**. Personnumret `19500315-2384` är medvetet utanför Skatteverkets intervall.

---

## 12. Deploy-modell

| Miljö | Arkitektur | Trädgårdsmur |
|---|---|---|
| Laptop (utveckling) | Docker Compose single-node, arm64 | — |
| Intern test (CarliusFyra) | Docker Compose single-node, x86_64 | NAS-intern DMZ |
| Intern test distribuerat | Docker Compose + 1–2 region-edge-noder | NAS + Mac minis |
| Produktion (Beyond) | Kubernetes (Helm-charts) | Region-interna nät |
| Vårdcentral (Sprint 1+) | Care-unit-edge container på lokal PC | Internt vårdcentralsnät |

Multi-arch Docker-images byggs via `scripts/build.sh` (buildx + `core-builder`).

Konkreta deploy-instruktioner för CarliusFyra och VPS finns i [INSTALL.md](INSTALL.md).

---

## 13. Observabilitet

| Signal | Plats | Verktyg |
|---|---|---|
| Application logs | pino JSON → stdout per tjänst | `docker compose logs -f <service>` |
| Kafka consumer lag | Kafka UI | http://localhost:8080 |
| Health | `GET /health` per tjänst | curl |
| Systemstatus | dashboard → "Systemstatus" | — |
| Datakvalitet | `core.system.quality.metrics` → dashboard | — |
| Edge-heartbeat | `core.system.edge.heartbeat` → topologivy | — |
| Lakehouse-status | bronze/silver/gold checkpoint-events | dashboard "Datakvalitet" (Sprint 4) |
| CDS-diff | `core.system.cds.diff` → CdsAlerts-vy | Sprint 5 |

Prometheus-exporterare per tjänst (`core_*`-metrics). Grafana som dashboard i produktion (Beyond).

---

## 14. Framtida arbete (Beyond Sprint 5)

Vid `1.0.0` är scope enligt Sprint 5 stabilt. Bortom 1.0.0 finns flera arbetsströmmar:

### Tekniska

- **Full CDS-migrering** (steg 4–6 av P7) — när diff-topic visat 0 avvikelser i 30 dagar, bryt ut hårdkodade regler. Bara CQL kvar.
- **AQL-broker mognad** — minska FHIR-materialiseringen till projection-views när AQL-prestandan är validerad.
- **Helm-charts för Kubernetes-deploy** — ersätter Docker Compose i produktion.
- **Avro + Schema Registry** — strukturerade event-schema för alla clinical topics. Schema Registry är redan på plats.
- **SMART on FHIR launch** — så externa EHR:er (Take Care, Cosmic, Cambio Cosmic) kan starta Nimloth in-context.
- **Fler source-system-anslutningar** — Take Care, Cosmic, Cambio.
- **Client-edge som PWA** — IndexedDB + Service Worker för mobil och ambulans.
- **Reconciliation-engine** — periodisk sanity-check mellan källsystem och canonical store.
- **Avancerad conflict-resolution** — utökad CRDT-liknande logik vid reconnect (just nu LWW + källa-prioritet).
- **Real Debezium på edge** — Lokal CDC per sjukhus-edge. SyncManagern är förberedd; kräver Kafka Connect per edge.

### Arkitekturella

- **Mikrotjänst-separation** — när modulgränser stabiliserats, bryt ut specifika domäner.
- **Multi-tenant** — en Nimloth Core-instans för flera regioner.
- **Full EHDS-compliance** — när EHDS-förordningen är i full drift.

### Klinisk utveckling

- **Fler openEHR-templates** — psykiatri, barnmedicin, onkologi.
- **Clinical workflows-motor** — strukturerat stöd för vårdprocesser (utöver datalagring).
- **Datakvalitets-reconciliation-vyer** för kliniker.

### Integration mellan Flow och Core

Om Scenario B (Flow som ingest-motor för Core) blir aktuellt: egen arkitekturdiskussion. Inte automatisk konsekvens av fork-strukturen.

---

## Referenser

- [`docs/ROADMAP.md`](ROADMAP.md) — Sprint 0–5 körplan med veckor och leverabler.
- [`docs/prompts/`](prompts/) — sju utbyggnadsprompter P1–P7.
- [`docs/POSITIONING.md`](POSITIONING.md) — Nimloth-familjens struktur (delat dokument med nimloth-flow).
- [`docs/SCENARIO.md`](SCENARIO.md) — Fru Andersson-scenariot (single-node + distribuerat).
- [`docs/EXTENDING.md`](EXTENDING.md) — anslut ett nytt källsystem eller edge-nod.
- [`docs/DESIGN.md`](DESIGN.md) — designmockup → kod.
- [`docs/INSTALL.md`](INSTALL.md) — deploy till CarliusFyra / VPS.
- [`docs/QUICKDEMO.md`](QUICKDEMO.md) — 3 / 10 / 20-minuters demoguide.
- Pre-fork-arkivet (nimloth-docs): `VGR_Datahub_WorkPlan.md` (15-stegsplanen som drev Sprint 0-baseline) + `VGR_Datahub_ClaudeCode_Prompts_v2_Distributed.md` (källprompts för distribuerat läge) + `Nimloth_Core_Utbyggnadsplan.md` (arkitekturell rationale för P1–P7).
- Artikelserien *Nästa generations journalsystem* — arkitektoniskt fundament.
- HL7 FHIR R4: https://hl7.org/fhir/R4/
- openEHR specifikation: https://specifications.openehr.org/
- CDS Hooks 1.1: https://cds-hooks.hl7.org/1.1/
- CQL specifikation: https://cql.hl7.org/
- OMOP CDM 5.4: https://ohdsi.github.io/CommonDataModel/cdm54.html
- PDL (2008:355): https://riksdagen.se/sv/dokument-lagar/dokument/svensk-forfattningssamling/patientdatalag-2008355_sfs-2008-355
