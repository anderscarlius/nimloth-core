# Quick Demo Guide

Tre färdiga demonstrationer av Nimloth Core. Välj format efter publik och tidsbudget.

| Format | Tid | Publik | Fokus |
|---|---|---|---|
| **A) 3-min walkthrough** | 3 min | Pitch / intro­video | Fru Andersson i patient-overview |
| **B) 10-min live demo** | 10 min | Klinisk stakeholder | CDS-kort + real-time-uppdatering |
| **C) 20-min teknisk demo** | 20 min | IT-ansvarig / arkitekt | Distribuerat läge, offline, topologi, Kafka UI |

Alla demos antar att stacken är igång. Om inte:

```bash
# Single-node (tillräckligt för A + B)
./scripts/start.sh

# Distribuerat (krävs för C)
./scripts/start-distributed.sh
```

Öppna **dashboard**: [http://localhost:3010](http://localhost:3010).

---

## A) 3-minuters walkthrough

**Mål:** visa att Nimloth Core löser informations­fragmentering för en akutläkare på 60 sekunder.

### Skript (prat + klick)

1. **"Fru Andersson, 74 år, kommer in till akuten efter ett fall."** (15 s)
   - Öppna dashboard-fliken `Patientsök`.
   - Skriv `19500315-2384` i sökrutan → klicka resultatet.

2. **"Allt akutläkaren behöver ligger överst."** (45 s)
   - Pek på **PatientBanner**: namn, personnummer, ålder.
   - **AllergyCard** (röd): "Penicillin V – urtikaria".
   - **CdsStack** — tre kort:
     - 🔴 **Kritiskt** — antikoagulerad (Waran), kontrollera INR.
     - 🟡 **Varning** — tidigare DVT, förlängd profylax.
     - 🟢 **Info** — höftprotes höger, Zimmer Avenir Complete.

3. **"Och all klinisk historik finns i flikarna."** (60 s)
   - Klicka `Läkemedel` → Waran, Metformin, Simvastatin, Paracetamol, Omeprazol.
   - Klicka `Operationer` → höftprotes 2025-03-15 med implantatdata (manufacturer, modell, lot).
   - Klicka `Diagnoser` → M16.1 koxartros → I82.4 DVT (länkade).

4. **"Vad hade hänt utan Nimloth Core?"** (30 s)
   - Melior SU (ortopedi), AsynjaVisph (Närhälsan), Pascal (Waran-förskrivning) = tre olika system, tre inloggningar, tre källor att samordna manuellt.
   - Nimloth Core: en FHIR-endpoint, ett UI, en respons på < 1 sekund.

### Avslut

> "Samma kodbas kan köras både centralt och distribuerat — en edge-nod per sjukhus som fortsätter fungera offline. Det är nästa demo."

Total tid: **~3 minuter**.

---

## B) 10-minuters live demo (klinisk stakeholder)

**Mål:** låta en klinisk beslutsfattare se att *den här läkaren får rätt varningar i rätt ögonblick*.

### Förberedelse (2 min före demo)

```bash
./scripts/start.sh        # vänta in "Nimloth Core är igång"
./scripts/demo-fru-andersson.sh   # verifiera API:erna först
```

Öppna dashboard i en stor browser-flik, zooma så rader är läsbara.

### Demo-skript

#### Del 1 — Inledning (1 min)

> "Det här är en prototyp av en regional datahubb för VGR. Idag ligger Fru Anderssons vård på fyra olika system — Melior på SU Mölndal där hon opererades, Pascal för hennes Waran-recept, AsynjaVisph på Närhälsan där hon är listad, och Flexlab för hennes labbprover. När hon kommer in på akuten på SU Östra har akutläkaren inte automatiskt åtkomst till något av det här."

#### Del 2 — Patient-overview (4 min)

- **Patientsök** → `19500315-2384` → enter.
- Peka på **PatientBanner**: "Här får läkaren omedelbar bekräftelse — rätt patient, rätt personnummer, 74 år, listad på Närhälsan Centrum."
- **Datakälla-badge** i vänstra kolumnen: "Och här ser vi att hennes data kommer från både Melior SU och AsynjaVisph — automatiskt sammanslaget."
- **AllergyCard** (röd): "Penicillin V. Urtikaria. Det här skulle normalt kräva inloggning i en separat journal — här syns det direkt."
- **CdsStack**: "Och det här är beslutsstödet. Tre kort sorterade kritiskt → info."
  - Klicka på antikoagulations-kortet: "Hon står på Waran. INR måste kontrolleras före ingrepp. Källan är VGR:s centrala CDS-regler — uppdateras en gång, används av alla sjukhus."

#### Del 3 — Flikarna (3 min)

- **Tidslinje** — skrolla genom 8 händelser från 2024 till 2025. "Hela vårdresan i kronologisk ordning — från första artros-diagnosen på Närhälsan, genom operation och postop-DVT på SU, till uppföljning."
- **Läkemedel** — "Fem aktiva läkemedel. Waran-raden har en INR-trend: 1,1 → 2,4 → 2,8 över fem dagar efter insättning."
- **Operationer** — klicka höftprotes-kortet. "Här finns implantatdatan vid behov av revision: Zimmer Avenir Complete, storlek 3, cementerad."

#### Del 4 — Realtids-update (2 min)

I en terminal sidoskärm:
```bash
./scripts/simulate-emergency.sh
```

Scriptet pushar ett nytt blodtryck in i Melior. På dashboard:
- Refresha patient-overview (eller invänta auto-refresh).
- Peka på **Vitala**-fliken → det nya BT-värdet dyker upp.

> "Det här händer automatiskt — källdatabasen ändras, CDC fångar det, Kafka transporterar det, Transform mappar det till FHIR, Facade materialiserar det, dashboarden ser det. Total end-to-end-latens är 3–5 sekunder."

### Avslut

Visa navigations-listan ("Systemstatus", "Topologi", "Åtkomstlogg") och säg:

> "Vi har också en admin-vy som visar att alla tjänster är gröna, en topologi-vy för när det körs över flera sjukhus, och en åtkomstlogg som uppfyller PDL-kraven — varje läsning loggas med vem, när, vilken patient, vilket syfte."

Total tid: **~10 minuter**.

---

## C) 20-minuters teknisk demo (IT-ansvarig / arkitekt)

**Mål:** visa att arkitekturen håller för distribuerad drift och att offline-scenariot faktiskt fungerar.

### Förberedelse (5 min före demo)

```bash
./scripts/reset.sh && ./scripts/start-distributed.sh
# vänta in "Distribuerat läge är igång!"
pnpm --filter @nimloth-core/e2e test:distributed   # smoketest 9/9
```

Öppna fyra browser-flikar:
1. Dashboard: `http://localhost:3010`
2. Topologi-vy: `http://localhost:3010/topology`
3. Kafka UI: `http://localhost:8080`
4. En terminal-panel för scripts

### Demo-skript

#### Del 1 — Arkitekturen i ett pass (3 min)

Öppna [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) på lager-diagrammet. Gå uppifrån och ner:

1. Sources — Postgres-databaser som simulerar Melior + AsynjaVisph.
2. Ingest — Debezium CDC, en connector per källsystem.
3. Event Bus — Kafka KRaft, topics grupperade efter lager.
4. Transform — 7 semantiska mappningar med patient-cache.
5. Canonical Store — Postgres-tabeller som speglar FHIR-resurser.
6. Consumption — FHIR Facade R4, CDS Hooks 1.1, Audit.
7. UI — React-dashboard.

Peka på distribuerat-lagret: **edge-nod per sjukhus** (SQLite-cache + offline-tolerans) + **replication-tjänst** som motsvarar Kafka MirrorMaker 2.

#### Del 2 — Kafka UI: topicsen är grupperade (2 min)

Öppna `http://localhost:8080` → topics-listan.

- `vgr.cdc.melior.su.public.*` — 10 st (en per tabell, partitioner 3–6).
- `vgr.cdc.asynja.public.*` — 5 st.
- `core.clinical.*` — 11 st (domän-events, 30d retention).
- `core.audit.access` — compact+delete, oändlig retention.
- `core.shared.*` — 4 st (patient-index, SPAR, CDS-regler, terminologi, compacted).
- `core.system.edge.heartbeat` — 1 st.
- `edge-su.core.clinical.*` — 11 st (edge-prefixade, skapas av replication).

Peka på `core.clinical.observation.vitals` → messages-fliken. Visa JSON-payloaden för ett event: `event_id`, `patient_id`, `source_system`, `payload.code`, `payload.value_numeric`.

#### Del 3 — Topologi-vy (3 min)

Öppna `http://localhost:3010/topology`.

- **SVG-karta** med central hub i mitten + edge-su som grön nod.
- Animerade dashed-linjer visar event-flöde.
- Klicka edge-su → sidopanel: FHIR-cache patienter, buffered events, replication-lag, uptime.

> "Heartbeats går var 30:e sekund till `core.system.edge.heartbeat`. Replication-tjänsten håller senaste heartbeat per instans i minnet och exponerar det på `/topology`."

#### Del 4 — Offline-demo (8 min) — HUVUDNUMMER

Terminal-fönstret:

```bash
./scripts/simulate-network-failure.sh
```

Läs av utskriften live medan det händer. Scriptet gör:

1. **Verifierar online** — central, edge, replication alla `status=ok`.
2. **Söker Fru Andersson via edge-nod** — lokalt svar med 70 resurser.
3. **Kopplar bort `edge-su` från nätverket `nimloth-core`** med `docker network disconnect` (ingen iptables).
4. **Väntar 15 s** — OfflineDetector upptäcker efter 3 × 5s missade pings.
5. **Verifierar att kliniker fortfarande kan arbeta** — `docker exec edge-su wget` mot lokal FHIR + CDS. Funkar fortfarande eftersom edge-noden har sin egen lokala Kafka + SQLite-cache.
6. **Kopplar tillbaka nätverket** — `docker network connect`.
7. **Edge detekterar reconnect** inom 15 s, switchar till `mode=replaying`.
8. **Replaying → realtime** — buffrade events flushas till central, mode återgår.

Under tiden demo körs — parallellt i topologi-vyn:
- Edge-su blir orange (`replaying`) efter reconnect.
- Heartbeats fortsätter rapportera state-övergångarna.

> "Poängen är att en kliniker på SU under fiberavbrott mot region­huvudkontoret fortfarande kan söka upp patienter och få CDS-varningar, ur lokal cache. Ingen klinisk åtgärd blockeras. Vid återanslutning synkas allt automatiskt."

#### Del 5 — Ett ingrepp på akutscenariot (2 min)

Terminal:

```bash
./scripts/simulate-emergency-transfer.sh
```

Visar Fru Anderssons kompletta $everything via edge-FHIR (70 resurser: 14 mediciner, 32 observationer, 14 conditions, 2 procedures, 4 allergier, 2 encounters, 1 patient) + alla tre CDS-regler som triggar mot lokal cache.

#### Del 6 — Audit-logg (1 min)

Öppna dashboard → `Åtkomstlogg`. Varje anrop från de föregående demos har loggats med:
- Timestamp · HSA-ID · roll · action · resurs · patient-pnr · care-unit · purpose · outcome.

> "Det här är PDL-logg enligt 2008:355. Compacted+delete i Kafka, append-only 7 år i Postgres. Oåterkallelig."

#### Del 7 — Stoppa (1 min)

```bash
./scripts/stop.sh    # behåller volymer
# eller
./scripts/reset.sh   # wipear allt
```

### Avslut

Visa [`docs/EXTENDING.md`](EXTENDING.md) → "så här ansluter du ett nytt källsystem på 8 steg" och [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) → "framtida arbete" (Keycloak-integration, SMART on FHIR, Avro, reconciliation-engine).

> "PoC:n kör på en laptop idag; nästa steg är CarliusFyra-NAS:en eller en VPS — se `INSTALL.md` för deploy-guide."

Total tid: **~20 minuter**.

---

## D) Felsökning under demo

| Symptom under demo | Snabb fix |
|---|---|
| Dashboard visar "kunde inte ladda patient" | Kontrollera `curl http://localhost:3003/health` — om fel, `docker compose restart fhir-facade` |
| CDS-kort visas inte | `docker compose logs cds-hooks \| tail -20` — vanligast är att FHIR-facade var nere vid startup |
| Topologi-vy visar inga edges | Edge-heartbeat-latens — vänta 30 s till, kolla `curl http://localhost:3007/topology` direkt |
| Port 3010 redan i bruk | Stoppa annan dev-server, eller ändra mapping i `docker-compose.yml` |
| `simulate-network-failure.sh` fel "no such network" | Det distribuerade läget är inte igång — kör `./scripts/start-distributed.sh` |
| Allt är orange i topologin | Vanligast: edge startar fortfarande — vänta 60 s |

### Reset i paniksituation

```bash
./scripts/reset.sh && ./scripts/start-distributed.sh
```

Tar ~90 s. Skulle alltid lösa det.

---

## E) Referenser

- [README.md](../README.md) — snabbstart + projektstruktur
- [docs/SCENARIO.md](SCENARIO.md) — Fru Andersson-scenariot i detalj
- [docs/ARCHITECTURE.md](ARCHITECTURE.md) — bakomliggande arkitektur
- [docs/INSTALL.md](INSTALL.md) — deploy till CarliusFyra / VPS
- [docs/DESIGN.md](DESIGN.md) — UI-tokens + komponent-mapping
