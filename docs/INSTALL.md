# Installation & Deploy

Installationsguide för att sätta upp Nimloth Core på en **Linux-host**. Två miljöer beskrivs:

- **A)** CarliusFyra — Synology NAS (DSM 7.2, x86_64, 12 GB RAM, docker lever på `/volume2`).
- **B)** Generell VPS — Ubuntu 22.04 / Debian 12 (x86_64 eller arm64).

Utvecklingsmiljö (Mac/Linux laptop) beskrivs i [README.md#snabbstart](../README.md#snabbstart).

> **Not om status:** stacken är **PoC-level**. Den här guiden täcker "kör i ett intern-nätverk + nå via tunnel/VPN eller Traefik". Den är **inte** en produktionshärdning — TLS-certifikatshantering, HA, backup-rotation, monitoring/alerting ska läggas på innan det går live mot kliniker.

---

## 0. Checklista innan start

| Krav | Minsta | Rekommenderat |
|---|---|---|
| CPU | x86_64 eller arm64, 2 kärnor | 4 kärnor |
| RAM | 8 GB | 12 GB (single-node), 16 GB (distribuerat med 1 edge) |
| Disk | 30 GB fri på docker-volymen | 100 GB |
| Nätverk | LAN-åtkomst till host:3003, 3010, 8080 | Traefik/nginx framför + TLS |
| Verktyg | `docker`, `docker-compose`, `git`, `jq`, `curl` | `pnpm ≥ 9`, `node ≥ 20` (om du vill bygga lokalt) |

---

## A) CarliusFyra (Synology NAS)

### A.0 Synology-specifika gotchas (läs innan du börjar)

Följande skiljer sig från en vanlig Linux-host och bryter om du inte anpassar:

1. **Docker-binären ligger inte i PATH.** Absoluta paths krävs i scripts. För CarliusFyra:
   ```bash
   DOCKER="/volume2/@appstore/ContainerManager/usr/bin/docker"
   ```
2. **Använd `docker-compose` (bindestreck), inte `docker compose`.** Plugin-formen finns inte på DSM 7.2; varje kommando med `docker compose` felar tyst.
3. **Port-bindningar måste vara `0.0.0.0:<host>:<container>`** för att nås utanför NAS:en. Alla våra compose-portar har redan det formatet — ändra inte.
4. **scp/sftp funkar inte** (subsystem request failed). Använd pipe-transfer via ssh (se A.1).
5. **`@eaDir/`-mappar skapas överallt** av DSM. Är redan exkluderade i vår `.gitignore`.
6. **`/tmp` är noexec.** Kör scripts med `bash /tmp/script.sh`, inte `chmod +x && /tmp/script.sh`.
7. **Docker-socket kan resetta till `root:root`** vid DSM-uppdatering/omstart. Fix:
   ```bash
   sudo chown root:docker /var/run/docker.sock
   ```
   CarliusFyra har redan `/usr/local/bin/post-boot-fix.sh` för detta.
8. **Dev-verktyg** — nvm/pnpm/node finns inte som default. Vi kör därför **bara docker-compose** på NAS:en; kod bygger vi på laptop och pushar images.

Se `anthropic-skills:synology-ops` för den fullständiga fallgrops-listan.

### A.1 Överför koden

Eftersom scp/sftp inte fungerar: packa lokalt och pipe-överför:

```bash
# På din laptop i nimloth-core/:
tar --exclude='node_modules' --exclude='dist' --exclude='@eaDir' \
    --exclude='.git' --exclude='data' -czf /tmp/nimloth-core.tgz .

# Pipa till NAS (ssh-nyckel-auth via clawbot-agent eller SkyttenAdmin)
cat /tmp/nimloth-core.tgz | ssh SkyttenAdmin@192.168.1.189 \
    'cat > /volume2/docker/nimloth-core.tgz'

# Packa upp på NAS:en
ssh SkyttenAdmin@192.168.1.189 'cd /volume2/docker && \
    mkdir -p nimloth-core && cd nimloth-core && \
    tar xzf ../nimloth-core.tgz && rm ../nimloth-core.tgz'
```

Dev-tools (pnpm, vitest) behövs inte på NAS:en eftersom vi bygger images via buildx på laptopen och pushar dem.

### A.2 Bygg multi-arch images och pusha

På laptopen, bygg alla 7 Docker-images för `linux/amd64` (CarliusFyra är x86_64):

```bash
# På laptopen, i nimloth-core/
./scripts/build.sh --push   # kräver att DOCKER_REGISTRY env är satt
```

**Om du inte har ett privat registry:** använd `--load` för att bygga images som tar-filer och pipea över till NAS:en:

```bash
docker buildx build --platform linux/amd64 \
    -f services/ingest/Dockerfile -t nimloth-core/ingest:latest . --load
docker save nimloth-core/ingest:latest | gzip | ssh SkyttenAdmin@192.168.1.189 \
    'gunzip | /volume2/@appstore/ContainerManager/usr/bin/docker load'

# Upprepa för: transform, fhir-facade, cds-hooks, audit, dashboard,
#            edge, replication
```

Alternativt: låt NAS:en bygga själv (se A.3) — men det tar längre tid och kräver build-deps i containern.

### A.3 Konfigurera miljövariabler

På NAS:en:

```bash
ssh SkyttenAdmin@192.168.1.189
cd /volume2/docker/nimloth-core
cp .env.example .env
python3 -c "
p='.env'
with open(p) as f: txt = f.read()
# Säkra lösenord — byt från default
txt = txt.replace('MELIOR_DB_PASSWORD=melior', 'MELIOR_DB_PASSWORD=<nytt-lösenord>')
txt = txt.replace('ASYNJA_DB_PASSWORD=asynja', 'ASYNJA_DB_PASSWORD=<nytt-lösenord>')
txt = txt.replace('CORE_DB_PASSWORD=core', 'CORE_DB_PASSWORD=<nytt-lösenord>')
with open(p, 'w') as f: f.write(txt)
"
```

**Observera:** använd Python heredoc istället för `nano` eller `sed` — `nano` saknas på DSM och `sed` fallerar på citattecken. `vi` finns också men är obekvämt.

### A.4 Starta stacken

```bash
cd /volume2/docker/nimloth-core

# Single-node
docker-compose up -d

# ELLER distribuerat (edge-su på samma NAS — bara demo)
docker-compose -f docker-compose.yml -f docker-compose.distributed.yml \
    --profile edge-su up -d

# Vänta in Kafka healthy (kan ta ~60 s första gången)
docker-compose ps

# Skapa topics + seeda data
docker-compose exec kafka bash /opt/kafka/create-topics.sh

# Seed testdata — kräver pnpm. Om du inte har det på NAS:en:
# kör seed:all på laptopen mot remote docker:
#   export DOCKER_HOST=ssh://SkyttenAdmin@192.168.1.189
#   pnpm --filter @nimloth-core/test-data seed:all
# — eller kopiera in testdata via psql direkt (se packages/test-data/sql/).
```

### A.5 Portar och åtkomst från LAN

Standardportarna är mappade till `0.0.0.0` så de nås från ditt LAN på `192.168.1.189:<port>`:

| Port på NAS | Tjänst |
|---|---|
| `3003` | Central FHIR |
| `3004` | CDS Hooks |
| `3005` | Audit |
| `3007` | Replication (distribuerat) |
| `3010` | Dashboard |
| `4003–4006` | Edge-nod SU (distribuerat) |
| `8080` | Kafka UI |
| `8180` | Keycloak |

Öppna dashboard: `http://192.168.1.189:3010`.

**DSM-brandväggen:** kolla `Control Panel → Security → Firewall` att portarna ovan är tillåtna från ditt interna nät.

### A.6 Uppgradera images

Efter nya commits på laptopen:

```bash
# På laptop: bygg + pipea över nya images
docker buildx build --platform linux/amd64 \
    -f services/fhir-facade/Dockerfile -t nimloth-core/fhir-facade:latest . --load
docker save nimloth-core/fhir-facade:latest | gzip | \
    ssh SkyttenAdmin@192.168.1.189 \
    'gunzip | /volume2/@appstore/ContainerManager/usr/bin/docker load'

# På NAS: restart ladda nya image
ssh SkyttenAdmin@192.168.1.189 \
    'cd /volume2/docker/nimloth-core && docker-compose up -d --force-recreate fhir-facade'
```

### A.7 Backup och data-persistens

Docker-volymer:

| Volym | Innehåll | Backup-strategi |
|---|---|---|
| `melior-data` | Simulerad Melior-databas | Snapshot via DSM Snapshot Replication |
| `asynja-data` | Simulerad AsynjaVisph | Samma |
| `core-data` | Canonical FHIR store + audit | **Kritisk:** daglig `pg_dump` till `/volume1/backup` + DSM-snapshot |
| `kafka-data` | Kafka log segments | Snapshot räcker (events re-playas från CDC) |
| `edge-su-data` | SQLite FHIR-cache | Rebyggs automatiskt från central vid behov — ingen kritisk backup |

Kör exempel-backup var natt via DSM Task Scheduler:

```bash
#!/bin/bash
# /volume2/docker/nimloth-core/scripts/backup-core.sh
# Körs som root från Task Scheduler.
export PATH="/volume2/@appstore/ContainerManager/usr/bin:$PATH"
set +e  # strict mode kan krascha på DSM
DATE=$(date +%Y%m%d)
docker exec core-db pg_dump -U core -F c core \
    > /volume1/backup/nimloth-core-${DATE}.pgdump
find /volume1/backup -name 'nimloth-core-*.pgdump' -mtime +30 -delete
```

**Observera:** `set +e` istället för `set -euo pipefail` — DSM-shell kraschar oförutsägbart på strict mode.

### A.8 Felsökning

| Symptom | Trolig orsak | Åtgärd |
|---|---|---|
| `docker compose: command not found` | Plugin-formen finns inte | Använd `docker-compose` med bindestreck |
| Kafka-container startar om i loop | Disk-space på `/volume2` | Rensa gamla images: `docker image prune -a` |
| Port nås inte från LAN | DSM brandvägg eller `127.0.0.1`-bindning | Öppna i DSM Firewall, verifiera `0.0.0.0:...` i compose |
| Seed:all failar | pnpm saknas | Kör seed från laptopen via `DOCKER_HOST=ssh://...` |
| `@eaDir`-filer krånglar i git-pull | DSM metadata | Redan i `.gitignore`; `find . -name @eaDir -exec rm -rf {} +` |
| Efter DSM-reboot fungerar ingenting | `docker.sock` ownership | `sudo /usr/local/bin/post-boot-fix.sh` |

Se även [`docs/SCENARIO.md`](SCENARIO.md) för klinisk verifieringsguide.

---

## B) Generell VPS (Ubuntu/Debian)

### B.1 Förutsättningar på VPS:en

```bash
sudo apt update && sudo apt install -y \
    ca-certificates curl gnupg git jq

# Docker CE + compose plugin
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER   # logga ut/in efter detta

# pnpm (för seed + bygg om du inte pushar images)
curl -fsSL https://get.pnpm.io/install.sh | sh -
```

På VPS fungerar både `docker compose` (plugin) och `docker-compose` (standalone) — vi använder plugin-formen i instruktionerna här (samma som på laptop).

### B.2 Klona och starta

```bash
git clone <repo-url> /srv/nimloth-core
cd /srv/nimloth-core
cp .env.example .env
# Redigera .env → sätt starka lösenord + domän-URL:er

# Single-node
./scripts/start.sh

# ELLER distribuerat
./scripts/start-distributed.sh
```

Vite-dashboard startas i dev-mode (med HMR). För produktion, bygg statiskt:

```bash
pnpm --filter @nimloth-core/dashboard build
# → serveras via dashboard-container eller direkt via nginx från dist/
```

### B.3 Traefik framför tjänsterna

Exempel-override för TLS + routing:

```yaml
# docker-compose.prod.yml
services:
  traefik:
    image: traefik:v3.0
    command:
      - "--providers.docker=true"
      - "--providers.docker.exposedByDefault=false"
      - "--entrypoints.web.address=:80"
      - "--entrypoints.websecure.address=:443"
      - "--certificatesresolvers.le.acme.email=admin@example.com"
      - "--certificatesresolvers.le.acme.storage=/letsencrypt/acme.json"
      - "--certificatesresolvers.le.acme.httpchallenge.entrypoint=web"
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - letsencrypt:/letsencrypt

  fhir-facade:
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.fhir.rule=Host(`fhir.core.nimloth.io`)"
      - "traefik.http.routers.fhir.tls.certresolver=le"

  dashboard:
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.dash.rule=Host(`core.nimloth.io`)"
      - "traefik.http.routers.dash.tls.certresolver=le"
      - "traefik.http.services.dash.loadbalancer.server.port=3000"

volumes:
  letsencrypt:
```

Starta: `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d`.

### B.4 Keycloak wire-up

PoC:n kör Keycloak utan integration (container finns på port 8180). För att faktiskt låsa FHIR Facade bakom OIDC:

1. Skapa realm `nimloth-core` i Keycloak-adminpanelen.
2. Skapa client `nimloth-core-api` med redirect-URI till dashboard-hostnamnet.
3. Lägg till middleware i `services/fhir-facade/src/middleware/auth.ts` som verifierar JWT mot Keycloak JWKS — planeras men är inte implementerat i PoC.
4. Dashboard får en login-knapp som startar OIDC-flow.

Tills OIDC är wiredad kör PoC:n med PDL-headers (`X-User-HSA` etc.) som intern "auth" — funkar för demo men inte produktion.

### B.5 Övervakning

- **Loggar:** `docker compose logs -f <service>` eller Promtail → Loki.
- **Metrics:** FHIR Facade, Edge och Replication exponerar `/metrics` i Prometheus-format (enkel scrape-konfig i `infra/prometheus.yml`, planerad).
- **Health:** DSM notification / cron som pingar `http://host:3003/health` varje minut och larmar vid fel.

---

## C) Sanity-check efter deploy

Oavsett miljö — kör dessa efter första start:

```bash
# 1. Kafka + DB uppe
docker-compose ps    # alla healthy?

# 2. Topics skapade
docker-compose exec kafka bash /opt/kafka/create-topics.sh 2>&1 | tail -5

# 3. CDC-connectors registrerade
curl -s http://<host>:8083/connectors | jq

# 4. Fru Andersson materializerad
curl -s "http://<host>:3003/fhir/r4/Patient?identifier=19500315-2384" \
    -H "X-User-HSA: SE-SANITY" -H "X-User-Role: PHYSICIAN" \
    -H "X-PDL-Care-Relation: true" -H "X-PDL-Purpose: CARE" \
    -H "X-PDL-Care-Unit: SE-UNIT" | jq '.total'
# Förväntat: 1

# 5. CDS-kort triggar
curl -s -X POST http://<host>:3004/cds-services/core-anticoagulation \
    -H "Content-Type: application/json" \
    -d '{"hookInstance":"sanity","hook":"patient-view","context":{"userId":"Practitioner/1","patientId":"Patient/19500315-2384"}}' \
    | jq '.cards[0].indicator'
# Förväntat: "critical"

# 6. Dashboard svarar
curl -s http://<host>:3010/ | grep -c "Nimloth Core"
# Förväntat: ≥ 1

# 7. (Distribuerat) topology-endpoint
curl -s http://<host>:3007/topology | jq '.edges | length'
# Förväntat: ≥ 1
```

Om alla sju kommandon svarar förväntat är deploy-en klar. Fortsätt till [`docs/QUICKDEMO.md`](QUICKDEMO.md) för att köra en demo.

---

## D) Referenser

- [README.md](../README.md) — snabbstart för lokal utveckling
- [docs/ARCHITECTURE.md](ARCHITECTURE.md) — lager, topics, data-flöde
- [docs/QUICKDEMO.md](QUICKDEMO.md) — 3/10/20-minuters demoscenarier
- [anthropic-skills:synology-ops](https://…) — Synology-specifika fallgropar
- [Docker Compose networking](https://docs.docker.com/compose/networking/)
- [Traefik v3 docs](https://doc.traefik.io/traefik/)
