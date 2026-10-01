# WP-LH1 — Runbook: Bronze→Silver smoke

**Dataklass:** 0 (syntetisk demo). **Tjänst:** `domain-event-lakehouse-stub` (:3021).

## 1. Offline smoke (CI / utan Docker)

Kör från repo-root:

```bash
./scripts/wp-lh1-bronze-silver-smoke.sh
```

Förväntat: `WP_LH1_OK=1`, silver magnitude satt, unit-tester gröna.

## 2. Med Kafka (lokal stack)

Förutsätter Kafka + topics (t.ex. `./scripts/start.sh` eller motsvarande).

```bash
docker compose --profile domain-events up -d domain-event-lakehouse-stub
```

Publicera syntetisk vital (WP-DEMO1-script):

```bash
pnpm exec tsx deploy/demo-slice/publish-synthetic-vital.ts --magnitude 37.1
```

Committa composition (openehr-composer / demo-kedja) så att
`CompositionCommitted` publiceras med samma `trigger_event_id` som vitals-eventet.

Kontroller:

```bash
curl -s http://localhost:3021/stats | jq .
docker compose exec domain-event-lakehouse-stub tail -n 2 /data/bronze-composition-committed.ndjson
docker compose exec domain-event-lakehouse-stub tail -n 2 /data/silver-body-temperature.ndjson
```

Silver-rad ska innehålla `openehr_path` … `/value/magnitude` och `magnitude`.

## 3. Felsökning

| Symptom | Åtgärd |
|---------|--------|
| `silverAppended: 0`, `silverSkippedNoJoin` ökar | Vitals måste konsumeras **före** eller i samma session som composition; skicka vital igen och repetera commit, eller starta stub med `fromBeginning: true` endast i dev. |
| `rejected` ökar | JSON eller `CompositionCommitted`-schema — se WP-EVT1 spec. |
| Tom bronze-fil | Kontrollera `DOMAIN_EVENTS_ENABLED` på composer och topic `core.domain.composition.committed`. |

## 4. Lagring (interim)

| Fil | Innehåll |
|-----|----------|
| `/data/bronze-composition-committed.ndjson` | Append-only bronze (`layer: bronze`) |
| `/data/silver-body-temperature.ndjson` | Append-only silver (`layer: silver`) |

Volym: `domain-event-lakehouse-data` i `docker-compose.yml`. **Inte** Iceberg — se
`spec/wp-lh1-lakehouse-bronze-silver-smoke.md` för P6-migration.
