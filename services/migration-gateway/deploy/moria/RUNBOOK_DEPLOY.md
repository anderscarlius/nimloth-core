# Deploy-runbook — B4-kedjan (migration-gateway + nimloth-legacy-sim) till Moria

**Sedan:** B7, 2026-08-19/28. Första deployen av B4-kedjan till Moria —
ingen befintlig container att ersätta. Helt isolerad från
`/opt/nimloth-core` (den 26-tjänstersstacken) och dess `core-db`/
`ehrbase-core` — se `Grind1`-anteckningarna (amenderat 2026-08-28: målet
är att det som kör på Moria ska vara EXAKT det B7 nivå 1-CI-jobbet
reser, bara med längre uptime).

**Två repon, en logisk enhet.** `nimloth-legacy-sim` deployas FÖRST (så
`b4-chain`-nätverket finns när migration-gateway startar och behöver nå
den via containernamn) — men ordningen spelar ingen roll för nätverket
i sig (`deploy.sh` skapar det idempotent, oavsett vilken sida som kör
först).

## Drift-regel — läs innan du kör

Samma regel som `cohort-service/deploy/RUNBOOK_DEPLOY.md`: filerna på
Moria är **engångskopior**, redigeras aldrig på plats. Källan är alltid
respektive repo. `deploy.sh` loggar käll-SHA + compose-filens sha256 vid
varje körning.

## Engångsförberedelse — registry-token

Delad med nimloth-compose/cohort-service: `/opt/nimloth-deploy/.env`
(`GHCR_USER`/`GHCR_PAT`). Ingen ny token behövs.

## Steg 1 — nimloth-legacy-sim

```bash
GIT_SHA=$(git -C ~/SynologyDrive/Hemmabasen/Kod/Nimloth/nimloth-legacy-sim rev-parse --short=7 HEAD)
IMAGE_TAG="sha-${GIT_SHA}"

ssh anderscarlius@192.168.1.220 "mkdir -p /opt/nimloth-deploy/nimloth-legacy-sim"
scp ~/SynologyDrive/Hemmabasen/Kod/Nimloth/nimloth-legacy-sim/deploy/docker-compose.moria.yml \
    ~/SynologyDrive/Hemmabasen/Kod/Nimloth/nimloth-legacy-sim/deploy/deploy.sh \
    anderscarlius@192.168.1.220:/opt/nimloth-deploy/nimloth-legacy-sim/
ssh anderscarlius@192.168.1.220 "chmod +x /opt/nimloth-deploy/nimloth-legacy-sim/deploy.sh"

ssh anderscarlius@192.168.1.220 "cd /opt/nimloth-deploy/nimloth-legacy-sim && IMAGE_TAG=${IMAGE_TAG} DEPLOY_SOURCE_SHA=$(git -C ~/SynologyDrive/Hemmabasen/Kod/Nimloth/nimloth-legacy-sim rev-parse HEAD) ./deploy.sh"
```

**Rollback (steg 1 ensamt):** ingen befintlig container fanns innan —
`deploy.sh` skriver ut "(ingen körande container — första deploy)".
Rollback av ett MISSLYCKAT steg 1 = `docker compose -f
docker-compose.moria.yml down -v` i `/opt/nimloth-deploy/nimloth-legacy-sim/`
(tar bort den NYA, tomma volymen — ingen befintlig data finns att
förlora, S5 kränks inte).

**Verifiera innan steg 2:**
```bash
ssh anderscarlius@192.168.1.220 "curl -sS http://127.0.0.1:11601/healthz"
```

## Steg 2 — migration-gateway

```bash
GIT_SHA=$(git rev-parse --short=7 HEAD)
IMAGE_TAG="sha-${GIT_SHA}"

ssh anderscarlius@192.168.1.220 "mkdir -p /opt/nimloth-deploy/migration-gateway"
scp services/migration-gateway/deploy/moria/docker-compose.moria.yml \
    services/migration-gateway/deploy/moria/deploy.sh \
    anderscarlius@192.168.1.220:/opt/nimloth-deploy/migration-gateway/
ssh anderscarlius@192.168.1.220 "chmod +x /opt/nimloth-deploy/migration-gateway/deploy.sh"

ssh anderscarlius@192.168.1.220 "cd /opt/nimloth-deploy/migration-gateway && IMAGE_TAG=${IMAGE_TAG} DEPLOY_SOURCE_SHA=$(git rev-parse HEAD) ./deploy.sh"
```

**Rollback (steg 2 ensamt):** samma mönster — `docker compose -f
docker-compose.moria.yml down -v` i `/opt/nimloth-deploy/migration-gateway/`.
Rör INTE steg 1:s containrar/volymer.

## Steg 3 — ladda progress_note.v1 i demo-EHRbase

Engångsbootstrap, samma script som CI-jobbet kör (se
`services/migration-gateway/deploy/ci/run-b4-chain-verification.sh`
steg 2/9), riktat mot den nya demo-EHRbase-porten:

```bash
EHRBASE_URL="http://192.168.1.220:11871" \
  pnpm --filter @nimloth-core/openehr-composer exec tsx \
  src/bridge/scripts/load-bridge-templates.ts
```

**Rollback:** ingen — additivt, kan köras om säkert (`409 already
loaded` för redan laddade mallar, se scriptets egen exit-logik).

## Steg 4 — seeda en syntetisk demo-patient + identitetsmappning

Samma mönster som `nimloth-legacy-sim/scripts/seed-demo-notes.mjs` +
en `POST /identity`, riktat mot Morias portar (11601/11113) i stället
för localhost. Exakta kommandon skrivs i Fas C-rapporten efter att den
faktiska EHR:en skapats (samma `curl`-mönster som
`run-b4-chain-verification.sh` steg 3-4).

**Rollback:** en ny, namngiven demo-patient — ingen befintlig data
rörs eller raderas (S5).

## Steg 5 — Traefik/Cloudflare-exponering

Traefik-labels är redan satta i `docker-compose.moria.yml` (steg 2).
**Beroende som kan kräva Anders:** om `b4-demo.carlius.net` inte redan
täcks av en wildcard-DNS mot tunneln, måste hostnamnet registreras i
Cloudflare Zero Trust-dashboarden separat — se `B7_CICD_och_Moria_...md`
för status.

**Rollback:** ta bort `traefik.*`-labels ur compose-filen och kör om
`docker compose up -d` — Traefik slutar routa direkt, ingen Cloudflare-
sidan behöver röras.

## Verifiering efter hela deployen (S9 — inget annat på Moria påverkat)

```bash
ssh anderscarlius@192.168.1.220 "docker inspect migration-gateway --format '{{index .Config.Labels \"org.opencontainers.image.revision\"}}'"
ssh anderscarlius@192.168.1.220 "docker inspect migration-gateway --format '{{.State.Health.Status}}'"
ssh anderscarlius@192.168.1.220 "curl -sS http://127.0.0.1:11113/healthz"
ssh anderscarlius@192.168.1.220 "curl -sS http://127.0.0.1:11871/ehrbase/"

# S3/S9 — bekräfta att INGET annat rördes:
ssh anderscarlius@192.168.1.220 "docker ps --format '{{.Names}}' | grep -c '^' "  # samma antal + 4 (jämför mot Fas A:s inventering)
ssh anderscarlius@192.168.1.220 "docker inspect ehrbase-core --format '{{.State.StartedAt}}'"   # OFÖRÄNDRAT — inte omstartad
ssh anderscarlius@192.168.1.220 "docker inspect core-db --format '{{.State.StartedAt}}'"          # OFÖRÄNDRAT — inte omstartad
```

## Rollback, hela kedjan

```bash
ssh anderscarlius@192.168.1.220 "cd /opt/nimloth-deploy/migration-gateway && docker compose -f docker-compose.moria.yml down -v"
ssh anderscarlius@192.168.1.220 "cd /opt/nimloth-deploy/nimloth-legacy-sim && docker compose -f docker-compose.moria.yml down -v"
ssh anderscarlius@192.168.1.220 "docker network rm b4-chain"
```

`-v` är säkert här (S5) — volymerna är NYA, skapade av denna deploy,
ingen befintlig Moria-data berörs. Detta är B4-kedjans EGEN
återgångsförmåga tillämpad på sig själv: samma "ingen väg in utan en
väg tillbaka"-princip som B4 självt bevisar.
