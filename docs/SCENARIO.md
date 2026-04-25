# Scenario: Fru Andersson

Det här dokumentet beskriver **kärnscenariot** som driver hela Nimloth Core — från problem till dataflöde till användargränssnitt. Allt annat i prototypen (FHIR‑facaden, CDS‑hooks, audit‑loggen, edge‑noderna) finns för att lösa det som händer här.

> **Mockup‑not:** hifi‑prototypen i `design_handoff/` använder namnet **"Ingrid Andersson"** medan seed‑scriptet och originalscenariot hänvisar till **"Margit Andersson"**. Personnumret är detsamma — **19500315‑2384** — och det är det FHIR‑identifieraren ser. Betrakta "Fru Andersson" som en persona; förnamnet är kosmetiskt och anpassas efter UI‑kontext.

---

## 1. Patienthistorik

**Fru Andersson**, född 1950‑03‑15, 74 år, bor på Storgatan 14 i Göteborg. Listad på **Närhälsan VC Centrum** (AsynjaVisph). Grundsjukdomar:

- **Typ 2‑diabetes** sedan 2018 — Metformin 500 mg × 2.
- **Hypertoni / hyperkolesterolemi** — Simvastatin 20 mg × 1.
- **Refluxsjukdom** — Omeprazol 20 mg × 1.
- **Penicillinallergi** (urtikaria, måttlig svårighetsgrad) — dokumenterad i Melior SU sedan ett tidigare vårdtillfälle.

### Den kritiska perioden — mars 2025

| Datum | Händelse | System |
|---|---|---|
| 2025‑02‑20 | Ny ICD‑10‑diagnos **M16.1** (primär koxartros höger). Röntgen visar grad 3 artros. Remiss till ortoped. | AsynjaVisph (Närhälsan) |
| 2025‑03‑14 | Inskrivning ortopedavdelning SU Mölndal. Preoperativ utredning: EKG, blodstatus, INR 1,1. | Melior SU |
| **2025‑03‑15** | **Total höftprotesplastik höger (KVÅ NFB49)**, cementerad, **Zimmer Avenir Complete**, size 3 stem / 52 mm cup. Duration 95 min, spinalanestesi. Kirurg Dr. Erik Lindqvist (HSA SE123456789). | Melior SU |
| **2025‑03‑18** | Postoperativ **djup ventrombos (ICD‑10 I82.4)**. Ultraljud konfirmerar tromb i v. femoralis. **Waran 2,5 mg × 1 insätts** (ATC B01AA03). | Melior SU |
| 2025‑03‑20 | INR 2,8 (målområde 2,0–3,0). | Melior SU |
| 2025‑03‑25 | Utskrivning. Waran fortsätter minst 35 dagar postoperativt. | Melior SU |
| 2025‑05‑05 | Uppföljning ortopedmott. Protes i gott läge, gångförmåga 200 m. | Melior SU |
| 2025‑10‑15 | Årskontroll diabetes hos Närhälsan. HbA1c 52, INR 2,8, Krea 78. | AsynjaVisph |

**Sju månader senare** (oktober 2025): Fru Andersson faller i hemmet och ambuleras till **akutmottagningen SU Östra**.

---

## 2. Problemet

Ambulansen lämnar över Fru Andersson till akutläkaren. Hon är medveten men har ont i höger sida. Läkaren har tre frågor som **måste besvaras innan smärtlindring och utredning**:

1. **Vilka mediciner står hon på?** — påverkar val av analgetika.
2. **Är hon antikoagulerad?** — påverkar akutkirurgi och DVT‑profylax.
3. **Har hon några kända allergier?** — påverkar antibiotika/anestesi.

Utan en datahubb:

- **Melior SU** (Mölndal) har hennes ortoped‑historik — men akutläkaren på SU Östra har inte aktiv vårdrelation i Melior SU:s PDL, och Melior Östra och Melior Mölndal är **olika installationer**.
- **AsynjaVisph** (Närhälsan) har hennes grund‑läkemedel — men finns bara tillgängligt via Läkemedelsförteckningen i separat inloggning, och saknar de akutvårds‑insatta medicinerna.
- **Waran 2,5 mg** är förskrivet på SU Mölndal och finns i Pascal, men Fru Andersson kan inte redogöra för det just nu.
- **Penicillinallergin** ligger i ett fritextfält i ett gammalt Melior‑besök.

Resultatet i nuläget: akutläkaren måste ringa, vänta, och gissa. **Första dosen Clindamycin (pga "misstänkt allergi") ger Clostridium‑diarré två veckor senare.** **Första dosen NSAID som smärtlindring förvärrar blödningsrisken vid antikoagulation.** Båda missarna är spårbara till informationsfragmentering.

---

## 3. Nimloth Core löser

Akutläkaren loggar in i **Nimloth Core Dashboard**, söker "19500315‑2384", och ser:

### 3.1 PatientBanner

```
 IA   Ingrid Andersson      74, Kvinna    Listad: Närhälsan VC Centrum
      19500315-2384                        Vårdrelation: Aktiv (akut)
```

### 3.2 AllergyCard (rött)

- **Penicillin V** — Urtikaria (måttlig). Källa: **Melior SU**.

### 3.3 CdsStack

Tre kort, sorterade kritiskt → info:

- 🔴 **Kritiskt:** Antikoagulerad patient — kontrollera INR före ingrepp.
  - Detalj: Patienten står på Waran 2,5 mg (ATC B01AA03). Senaste INR 2,8 (2025‑03‑20). Vid akut ingrepp bör aktuellt INR kontrolleras. Målområde 2,0–3,0.
  - Källa: VGR CDS · Waran‑profylax.
  - Föreslagna åtgärder: `[Beställ akut INR]` `[Visa INR‑trend]`
- 🟡 **Varning:** Tidigare DVT 2025‑03‑18 — utökad profylax rekommenderad.
  - Detalj: Postoperativ DVT efter höftprotes. Förlängd trombosprofylax rekommenderas i minst 35 dagar postoperativt enligt VGR‑riktlinje.
  - Källa: VGR CDS · Trombosprofylax.
- 🟢 **Info:** Höftprotes höger — cemented, Zimmer Avenir Complete.
  - Detalj: Inopererad 2025‑03‑15 på SU Mölndal. Vid misstanke om periprostetisk fraktur, notera implantattyp.
  - Källa: Melior SU · Implantatregister.

### 3.4 Tab bar

Läkaren klickar sig igenom flikarna:

- **Tidslinje** — åtta händelser från 2024‑11 till 2025‑10, varje med källbadge (melior‑su / asynja / flexlab). DVT‑raden markerad kritisk.
- **Läkemedel** — tabell med fem aktiva mediciner. Waran‑raden är **highlightad** och har en sub‑rad med INR‑trend (1,1 → 2,4 → 2,8 över 5 dagar).
- **Labb** — grupperat i Hematologi / Kemi / Koagulation, med sparklines och H/L/!‑flaggor. INR 2,8 ligger inom målområde.
- **Ingrepp** — kortet för höftprotesen expanderar till implantatblock: manufacturer, model, size, datum, kirurg, komplikation (DVT).
- **Diagnoser** — ICD‑10‑tabell med länkade diagnoser: M16.1 (primär) → Z96.64 (protes in situ) → I82.4 (DVT, komplikation).
- **Vitala** — KPI‑kort för BT, puls, temp, SpO₂, vikt, BMI med 120‑dagars trendgraf.
- **Vårdkontakter** — åtta encounters med källbadge och typ (slutenvård / öppenvård / akut / dagsjukvård).

### 3.5 Beslutsstöd i akut kontext

Akutläkaren får svar på sina tre frågor **på under 15 sekunder**:

1. Waran + Metformin + Simvastatin + Omeprazol + Paracetamol. *(→ dropp, inte NSAID.)*
2. **Ja** — Waran, INR 2,8 senast mätt. *(→ beställ akut INR, inga scheman‑/spinalblockader utan värde.)*
3. Penicillinallergi (urtikaria). *(→ Clindamycin eller Cefuroxim utan penicillin‑skelett.)*

Om ortopeden senare lägger en **NSAID‑order** triggar CDS Hooks (`medication-prescribe` hook) en **kritisk interaktionsvarning** (Waran + NSAID) innan ordinationen går till Pascal.

---

## 4. Dataflödet bakom scenen

```
 Melior SU              AsynjaVisph (Närhälsan)
 ─────────              ───────────────────────
 patients               patients (speglad via SPAR)
 encounters             encounters
 procedures             prescriptions
 diagnoses              diagnoses
 medications            allergies
 allergies
        │                        │
        └──────┐      ┌──────────┘
               ▼      ▼
     Debezium CDC connectors
               │
               ▼
       Kafka topic:
  vgr.cdc.melior.su.public.*
  vgr.cdc.asynja.public.*
               │
               ▼
     Transform (7 mappers)
   + Patient‑cache, terminologi
   + Instance‑prefix på IDs
               │
               ▼
 Kafka domain topics (core.clinical.*)
               │
               ▼
    FHIR Facade materializer
               │
               ▼
       Core Postgres
   (fhir_patients, fhir_observations, …)
               │
               ▼
  ┌─────────┬──────────┬──────────┐
  │ Dashboard   CDS Hooks   Audit (core.audit.access)
  │ (React)     (3 rules)
  └─────────┴──────────┴──────────┘
```

Vid varje läsning via FHIR Facade:

1. `X-PDL-Care-Relation: true` + `X-PDL-Purpose: CARE` → PDL‑gate släpper igenom.
2. `GET /Patient/{id}/$everything` läser ut alla FHIR‑resurser för Fru Andersson.
3. CDS Hooks fetchar samma data men via patient‑id i kontext → returnerar 3 kort.
4. Varje request skapar en audit‑post i `core.audit.access` med timestamp, HSA‑id, care‑unit, purpose.

---

## 5. Hur du kör demon

Scenariot är wired‑in i seed‑data + två demo‑scripts:

```bash
# Starta hubben
./scripts/start.sh

# Komplett FHIR/CDS/audit‑flow för Fru Andersson
./scripts/demo-fru-andersson.sh

# Akutscenario: live INSERT i Melior + dashboard uppdateras
./scripts/simulate-emergency.sh
```

`demo-fru-andersson.sh` gör:

1. `curl http://localhost:3003/fhir/r4/Patient?identifier=19500315-2384`
2. `curl http://localhost:3003/fhir/r4/AllergyIntolerance?patient=Patient/1`
3. `curl http://localhost:3003/fhir/r4/MedicationStatement?patient=Patient/1`
4. `curl http://localhost:3003/fhir/r4/Procedure?patient=Patient/1`
5. `curl http://localhost:3003/fhir/r4/Patient/1/$everything`
6. `curl -X POST http://localhost:3004/cds-services/core-anticoagulation` (med Fru Anderssons patient‑id)
7. `curl http://localhost:3005/audit/search?personnummer=19500315-2384`

Output ska visa:

- `name.family = "Andersson"`, `gender = "female"`, `birthDate = "1950-03-15"`
- `allergyIntolerance[0].substance.text` innehåller `Penicillin`
- `medicationStatement[].medication.text` innehåller `Waran` (och 4 andra)
- `procedure[].code.text` innehåller `höftprotes`/`NFB49` eller SNOMED `179344006`
- `$everything` returnerar ≥ 5 resurstyper i bundlen
- CDS‑svaret innehåller `cards[0].indicator = "critical"` och `"Waran"` i `summary`
- Audit‑sökningen returnerar ≥ 6 poster (en per FHIR‑anrop ovan)

`simulate-emergency.sh` skriver en akut `observation` (t.ex. BT 180/110) direkt i Melior‑DB och visar hur den flödar: CDC → Kafka → Transform → FHIR‑materializer → dashboard inom ~3 sekunder.

---

## 6. UI‑referens (hifi‑mockup)

Vyn ovan är implementerad i `services/dashboard/src/pages/PatientOverview.tsx` och kopplar till hifi‑mockupens **Patient overview**‑vy i `design_handoff/Nimloth Core.html`. Layout:

```
┌────────────────────────────────────────────────────────┐
│  ← Tillbaka till sökning                                │
├────────────────────────────────────────────────────────┤
│  PatientBanner — namn · pnr · ålder · listad VC         │
├────────────────────────────────────────────────────────┤
│  AllergyCard (röd ton)                                  │
├────────────────────────────────────────────────────────┤
│  CdsStack (3 kort, sorterade critical → warning → info) │
├────────────────────────────────────────────────────────┤
│  [Tidslinje]  [Läkemedel]  [Labb]  [Ingrepp]  [Diagn.]  │
│  [Vitala]  [Vårdkontakter]                              │
├────────────────────────────────────────────────────────┤
│                                                        │
│  Tab body (scrollar inom huvudinnehållet)               │
│                                                        │
└────────────────────────────────────────────────────────┘
```

Se [DESIGN.md](DESIGN.md) för design tokens (färg, typografi, spacing) och komponentstruktur.

---

## 7. Distribuerat scenario — edge-nod under nätavbrott

I distribuerat läge (`./scripts/start-distributed.sh`) kör SU Mölndal sin egen
**edge-nod** lokalt på sjukhuset (`services/edge/`). Den levererar Fru Anderssons
data via lokal FHIR + CDS även om fibern till centralhubben går ner — ett verkligt
scenario eftersom många av VGR:s sjukhus sitter på tunna länkar.

### 7.1 Förberedelse

Edge-noden initieras på startup i tre parallella steg:

1. **HTTP-bootstrap** — edge GET:ar `http://fhir-facade:3003/fhir/r4/Patient?_count=200` och sparar 14 patienter med namn/kön/födelsedatum i lokal SQLite (`/data/fhir-cache.db`).
2. **Kafka-delta** — inbound-consumer subscribar `core.clinical.*` (10 topics) + `core.shared.patient-index` + `core.shared.spar-register` med `fromBeginning: true`. Alla kliniska events replayas in i SQLite-cachen.
3. **OfflineDetector** — startar med 5s-intervall mot `http://fhir-facade:3003/health`. Tröskel 3 missade pings = offline.

Inom ~30 s har edge-su hydrerat ~14 patienter + 70 kliniska resurser för Fru Andersson.

### 7.2 Nätavbrott på SU Mölndal — tidslinje

`./scripts/simulate-network-failure.sh`:

```
T+0s    Allt online. Edge mode=realtime, central_hub_connected=true.
        Akutläkaren söker Fru Andersson via edge:4003 → träff, 70 resurser.

T+1s    docker network disconnect nimloth-core edge-su
        Edge tappar kontakt med centralt Kafka + FHIR.

T+5s    OfflineDetector pingar fhir-facade:3003/health → fetch failed (DNS).
T+10s   Andra pingen misslyckas.
T+15s   Tredje pingen misslyckas → isOnline=false → 'offline' emittas.
        SyncManager: mode=realtime → mode=buffering.
        StatusReporter publicerar nästa heartbeat med central_hub_connected=false.

T+15s+  Akutläkaren arbetar vidare. Edge:4003 FHIR + Edge:4004 CDS svarar
        från lokal SQLite-cache:
          - Patient-sök: "Ingrid Andersson" (från hydrerad cache)
          - $everything: 70 resurser (oförändrat)
          - CDS antikoagulation: kritiskt Waran-kort (samma regler lokalt)

        Kliniker: ingen märkbar skillnad. Enda indikationen är att
        dashboardens DataSourceIndicator visar "Offline-läge aktivt".

T+60s   docker network connect nimloth-core edge-su
        Edge återfår nätaccess.

T+65s   Första lyckade ping → 'reconnected' + 'online'.
        SyncManager: mode=buffering → mode=replaying.
        Buffrade events (om några) flushas till central via outbound-consumer.

T+75s   Ingen ny data på 10s → mode=replaying → mode=realtime.
        bufferedEvents=0. Edge åter i normalläge.

T+90s   Nästa heartbeat rapporterar status=online igen.
        Topology-vyn på /topology blir grön.
```

### 7.3 Vad som fungerar offline

| Funktion | Edge (offline) | Central (om edge är offline) |
|---|---|---|
| Patient-sök `/Patient?identifier=` | ✅ lokal SQLite | ✅ (edge påverkar inte central) |
| `$everything` | ✅ 70 resurser | ✅ |
| CDS Hooks (antikoagulation, implantat, DVT) | ✅ mot lokal cache | ✅ |
| Nya observationer från lokal Melior | ⏳ buffras i `edge-kafka-su` | Nej, synkas senare |
| Patient-index-uppdateringar | ⏳ ack vid reconnect | ✅ distributor jobbar vidare |
| Audit-loggning | ✅ till lokalt `core.audit.access` | ✅ synkas vid reconnect |

### 7.4 Host-port-gotcha på macOS

Om du testar scriptet på macOS Docker Desktop märker du att `curl http://localhost:4006/health` tappar kontakt ~15 s efter `docker network disconnect`. Det är en känd begränsning — docker-proxy slutar routa till container som plötsligt bara finns på ett sekundärt nätverk.

För att demot ändå ska fungera lever edge-su på **två nätverk**:
- `edge-su-local` — bara edge-su + edge-kafka-su.
- `nimloth-core` — central-stacken + edge-su.

I `docker-compose.distributed.yml` är `edge-su-local` listat **först** så Docker följer det för port-forwarding. När `nimloth-core` disconnectas behålls host-portarna via `edge-su-local`, och runtime fortsätter nåbar via host. Om det ändå krånglar: `docker exec edge-su wget http://127.0.0.1:3003/...` fungerar alltid.

Scriptet `simulate-network-failure.sh` verifierar offline-läget via `docker exec` för att vara stabilt mot den här docker-begränsningen.

### 7.5 Demo-tips

- Öppna `http://localhost:3010/topology` i en flik **innan** du kör scriptet — du ser edge-su växla grön → röd → orange (replaying) → grön.
- Kör parallellt `docker compose -f docker-compose.yml -f docker-compose.distributed.yml --profile edge-su logs -f edge-su | grep -E "offline|reconnect"` i en andra terminal så du ser detektorns events live.
- Efter demon: `curl http://localhost:3007/topology | jq '.edges[0].metrics'` visar slutmätningar (buffered_events = 0 när synkat klart).

---

## 8. Varför just det här scenariot?

**Fru Andersson är inte en kantfall** — hon är median‑svensken i vårdkedjan:

- Multisjuklig äldre kvinna, typisk för ~40 % av akutbesöken.
- Vård hos minst två huvudmän (primärvård + slutenvård).
- Antikoagulation — en av Socialstyrelsens top‑5 läkemedelsrisker.
- Implantat — växande population (höftproteser 18 000 per år i Sverige).
- Allergi — dokumenterad men på "fel ställe".

Om Nimloth Core löser Fru Anderssons scenario löser den grundbulten i VGR:s informationsfragmentering. Allt annat är inkrementella förbättringar.
