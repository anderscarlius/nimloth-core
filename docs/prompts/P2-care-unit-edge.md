# Prompt P2 — Care-unit-edge (vårdcentralsnivå)


## Kontext

`services/edge/` (ärvt från Nimloth Flow) är byggd för sjukhusnivå: egen Kafka + FHIR-replica + CDS + SyncManager. För tungt för en vårdcentral med 4 läkare och en NUC. Den verkliga resiliensfrågan är att mindre enheter ska kunna fortsätta ta emot patienter vid långvarigt nätavbrott (upp till 30 dagar).

## Mål

Skapa lättviktsruntime `services/care-unit-edge/` som kör i en container, använder SQLite istället för Kafka, synkar till central via HTTPS i batchar, och implementerar samma FHIR- och CDS-kontrakt utåt som nuvarande edge. Designprincip: *offline som normaltillstånd*.

## Leverans

- Ny tjänst `services/care-unit-edge/`
- Ny docker-compose-profil `edge-careunit-dalsland`
- Centralt sync-API: `POST /sync/push`, `GET /sync/pull`, `POST /sync/heartbeat`
- Nytt demo-script `scripts/simulate-vardcentral-offline.sh`
- Utvidgad topologivy med ikoner för sjukhus-edge vs care-unit-edge

## Steg

1. Skapa `services/care-unit-edge/` som single-container Node.js-app:
   ```
   services/care-unit-edge/
     src/
       fhir-server.ts
       cds-server.ts
       outbox-worker.ts
       sync-worker.ts
       offline-detector.ts
       db.ts
     Dockerfile
     package.json  (name: @nimloth-core/care-unit-edge)
   ```
2. SQLite-schema: samma `fhir_*`-tabeller som `core-db` men i SQLite. Plus:
   ```sql
   CREATE TABLE outbox (
     id INTEGER PRIMARY KEY,
     event_type TEXT, resource_type TEXT, resource_id TEXT,
     payload JSON, created_at TIMESTAMP, sync_attempts INT DEFAULT 0,
     synced_at TIMESTAMP NULL
   );
   CREATE TABLE sync_state (
     key TEXT PRIMARY KEY,
     value TEXT
   );
   ```
3. Central sync-API i `services/fhir-facade/`:
   - `POST /sync/push` — mottar batch, skriver till Kafka `core.clinical.*` med `source_instance=care-unit-<id>`.
   - `GET /sync/pull?since=<cursor>&patientIds=<list>` — returnerar events.
   - `POST /sync/heartbeat` — loggar till `core.system.edge.heartbeat`.
4. Outbox-worker: triggas vid lokal FHIR-skrivning, skriver till `outbox`. Idempotency = SHA256 av payload.
5. Sync-worker: var 30s, om online → hämta outbox → POST `/sync/push` batch av 50 → vid 2xx uppdatera `synced_at`. Sen GET `/sync/pull` → applicera på SQLite. Heartbeat.
6. Offline-detector: pollar `POST /sync/heartbeat` var 10s. 3 missade → offline. State: `realtime → degraded → offline → reconnecting → realtime`.
7. Hydrerings-strategi vid startup: `GET /sync/pull?since=0&patientIds=<listade>` → fullständig lokal kopia. Gäster: LRU 90 dagar.
8. Lägg till compose-profil:
   ```yaml
   care-unit-dalsland:
     build: services/care-unit-edge
     environment:
       UNIT_ID: vc-dalsland-01
       UNIT_NAME: "Vårdcentralen Bengtsfors"
       UNIT_HSA_ID: "SE2321000131-E000000000999"
       CENTRAL_URL: http://fhir-facade:3003
       LISTED_PATIENTS: "19500315-2384,..."
     ports: ["5003:3003", "5004:3004"]
     profiles: ["edge-careunit-dalsland"]
   ```
9. `scripts/simulate-vardcentral-offline.sh`: verifiera online → disconnect `nimloth-core`-nätverk → 15s → verifiera lokal funktion → reconnect → verifiera sync.
10. Utvidga `pages/Topology.tsx`: olika SVG-ikoner per edge-typ (`type: 'hospital' | 'care-unit' | 'client'`).

## Acceptans

- `docker compose -f docker-compose.yml -f docker-compose.distributed.yml --profile edge-careunit-dalsland up -d` startar Dalsland.
- `curl -s http://localhost:5003/fhir/r4/Patient?identifier=19500315-2384` returnerar Fru Andersson från SQLite.
- `simulate-vardcentral-offline.sh` grönt. Offline-fönstret: lokala FHIR + CDS svarar. Reconnect → sync inom 60s.
- `/topology` visar både `edge-su` och `care-unit-dalsland` med respektive `type`.
- SQLite <100 MB efter 30 dagars simulerad användning.

## Tekniska noteringar

- Port-offset +2000 från sjukhus-edge. Framtida care-units: +100 per.
- `better-sqlite3` (synkron, prestanda).
- `node-cron` för sync-worker.
- **Lokala skrivningar får inte blockera på sync-worker.** Strikt async outbox.

**Dependencies:** inga för skelettet. P5 (Inera) krävs för full offline-PDL.

---

