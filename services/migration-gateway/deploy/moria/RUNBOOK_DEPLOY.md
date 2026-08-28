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

## Deploysökväg — läs innan du kör (fynd, Fas C, 2026-08-28, provkört live)

`/opt/nimloth-deploy` ägs av `nsf-agent`, 0700. Att `chown`:a en
underkatalog räcker INTE — 0700 på FÖRÄLDERN blockerar all traversering
för `anderscarlius` in i NÅGOT under den, oavsett underkatalogens egna
rättigheter (bekräftat: `scp`/`chmod` gav "Permission denied" trots en
korrekt `anderscarlius`-ägd underkatalog). Denna B4-kedja deployas
därför till en helt NY, syskon-katalog **`/opt/nimloth-deploy-b4/`**
(inte nästlad under den begränsade) — `/opt/nimloth-core`-stackens
befintliga `/opt/nimloth-deploy/` (cohort-service, nimloth-compose)
rörs aldrig (S3, inte vårt att ändra). Det delade `.env`-token-filen
ligger kvar där den alltid legat och läses via `sudo cat` (redan
inbyggt i `deploy.sh`, `anderscarlius` har passwordless sudo).

**Engångsförberedelse (körd 2026-08-28, behöver inte köras om):**
```bash
ssh anderscarlius@192.168.1.220 "sudo mkdir -p /opt/nimloth-deploy-b4 && sudo chown anderscarlius:anderscarlius /opt/nimloth-deploy-b4 && chmod 755 /opt/nimloth-deploy-b4"
```

## Engångsförberedelse — registry-token

Delad med nimloth-compose/cohort-service: `/opt/nimloth-deploy/.env`
(`GHCR_USER`/`GHCR_PAT`). Ingen ny token behövs, inget nytt att skapa.

## Steg 1 — nimloth-legacy-sim

```bash
GIT_SHA=$(git -C ~/SynologyDrive/Hemmabasen/Kod/Nimloth/nimloth-legacy-sim rev-parse --short=7 HEAD)
IMAGE_TAG="sha-${GIT_SHA}"

ssh anderscarlius@192.168.1.220 "mkdir -p /opt/nimloth-deploy-b4/nimloth-legacy-sim"
scp ~/SynologyDrive/Hemmabasen/Kod/Nimloth/nimloth-legacy-sim/deploy/docker-compose.moria.yml \
    ~/SynologyDrive/Hemmabasen/Kod/Nimloth/nimloth-legacy-sim/deploy/deploy.sh \
    anderscarlius@192.168.1.220:/opt/nimloth-deploy-b4/nimloth-legacy-sim/
ssh anderscarlius@192.168.1.220 "chmod +x /opt/nimloth-deploy-b4/nimloth-legacy-sim/deploy.sh"

ssh anderscarlius@192.168.1.220 "cd /opt/nimloth-deploy-b4/nimloth-legacy-sim && IMAGE_TAG=${IMAGE_TAG} DEPLOY_SOURCE_SHA=$(git -C ~/SynologyDrive/Hemmabasen/Kod/Nimloth/nimloth-legacy-sim rev-parse HEAD) ./deploy.sh"
```

**Rollback (steg 1 ensamt):** ingen befintlig container fanns innan —
`deploy.sh` skriver ut "(ingen körande container — första deploy)".
Rollback av ett MISSLYCKAT steg 1 = `IMAGE_TAG=rollback docker compose
-f docker-compose.moria.yml down -v` i
`/opt/nimloth-deploy-b4/nimloth-legacy-sim/` (`IMAGE_TAG` krävs av
filen även för `down` — värdet spelar ingen roll för nedrivning, se
fyndet under "Rollback, hela kedjan"). Tar bort den NYA, tomma volymen
— ingen befintlig data finns att förlora, S5 kränks inte.

**Verifiera innan steg 2:**
```bash
ssh anderscarlius@192.168.1.220 "curl -sS http://127.0.0.1:11601/healthz"
```

## Steg 2 — migration-gateway

```bash
GIT_SHA=$(git rev-parse --short=7 HEAD)
IMAGE_TAG="sha-${GIT_SHA}"

ssh anderscarlius@192.168.1.220 "mkdir -p /opt/nimloth-deploy-b4/migration-gateway"
scp services/migration-gateway/deploy/moria/docker-compose.moria.yml \
    services/migration-gateway/deploy/moria/deploy.sh \
    anderscarlius@192.168.1.220:/opt/nimloth-deploy-b4/migration-gateway/
ssh anderscarlius@192.168.1.220 "chmod +x /opt/nimloth-deploy-b4/migration-gateway/deploy.sh"

ssh anderscarlius@192.168.1.220 "cd /opt/nimloth-deploy-b4/migration-gateway && IMAGE_TAG=${IMAGE_TAG} DEPLOY_SOURCE_SHA=$(git rev-parse HEAD) ./deploy.sh"
```

**Rollback (steg 2 ensamt):** samma mönster — `IMAGE_TAG=rollback
docker compose -f docker-compose.moria.yml down -v` i
`/opt/nimloth-deploy-b4/migration-gateway/`. Rör INTE steg 1:s
containrar/volymer.

## Steg 3 — ladda progress_note.v1 i demo-EHRbase

Engångsbootstrap, samma script som CI-jobbet kör (se
`services/migration-gateway/deploy/ci/run-b4-chain-verification.sh`
steg 2/10), riktat mot den nya demo-EHRbase-porten:

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

## Steg 5 — Cloudflare-exponering (INTE utförd, Anders' beslut)

**Traefik-labels fanns ursprungligen i planen (Grind 1, punkt g) men
togs bort igen** — upptäckt live i Fas C: Morias Traefik-container är
ansluten till nätverket `carlius-net`, inte `b4-chain`. Traefiks
Docker-provider upptäcker bara tjänster på nätverk den själv är
ansluten till, så labels på migration-gateway hade aldrig kunnat
routas dit oavsett innehåll. Att koppla `b4-chain` till `carlius-net`
löser det tekniskt men bryter mot hela poängen med en isolerad kedja
(Grind 1, punkt e) — inte gjort.

**Ingen wildcard mot `*.carlius.net` finns** (bekräftat via
`/opt/serveroperation/docs/tunnel-map.md`, framtaget 2026-08-10 direkt
mot Cloudflare-API:t), och **ingen DNS-post för `b4-demo.carlius.net`
finns än** (bekräftat via `cf-dns.py list`). Två steg krävs alltså, inte
ett — verktygen finns redan på Moria (`/usr/local/bin/cf-*.py`, root,
dry-run som standard); ingress-dry-runet kördes (utan `--apply`) för
att bekräfta att kommandot fungerar, DNS-steget provades bara som en
läsning (`list`):

```bash
# 1. DNS-post: peka subdomänen mot Moria-one-tunneln
sudo /usr/local/bin/cf-dns.py point b4-demo.carlius.net 9cb4131e-0f5c-4a18-a572-75051cdd3e41 --apply

# 2. Ingress-regel i tunnelns konfiguration
sudo /usr/local/bin/cf-ingress.py set b4-demo.carlius.net http://127.0.0.1:11113 --apply
```

Direkt mot containerns egna host-port (samma mönster som
`nimloth-atlas.carlius.net` → `127.0.0.1:11006`, ingen Traefik alls) —
INTE Traefik-vägen, av skälet ovan.

**Detta kommando är INTE körts.** `PUT` mot tunnelns ingress-endpoint
ersätter HELA listan (28 andra subdomäner just nu) — en delad,
svårlokal-fel-yta som ligger utanför den här etappens mandat att röra
själv (S3/S8). Gränsen (Anders, 2026-08-28): går hostnamnet inte att
lösa, stanna här och rapportera "deployad, ej exponerad" — inte
improvisera en exponering. Se Fas D-rapporten för den fulla
motiveringen.

**Rollback (om Anders kör `--apply` och vill ångra):**
```bash
sudo /usr/local/bin/cf-ingress.py del b4-demo.carlius.net --apply
sudo /usr/local/bin/cf-dns.py del b4-demo.carlius.net --apply
```

## Verifiering efter hela deployen (S9 — inget annat på Moria påverkat)

```bash
ssh anderscarlius@192.168.1.220 "docker inspect migration-gateway --format '{{index .Config.Labels \"org.opencontainers.image.revision\"}}'"
ssh anderscarlius@192.168.1.220 "docker inspect migration-gateway --format '{{.State.Health.Status}}'"
ssh anderscarlius@192.168.1.220 "curl -sS http://127.0.0.1:11113/healthz"
ssh anderscarlius@192.168.1.220 "curl -sS http://127.0.0.1:11871/ehrbase/"

# S3/S9 — bekräfta att INGET annat rördes:
ssh anderscarlius@192.168.1.220 "docker ps --format '{{.Names}}' | grep -c '^' "  # samma antal + 4 (jämför mot Fas A:s inventering: 94)
ssh anderscarlius@192.168.1.220 "docker inspect ehrbase-core --format '{{.State.StartedAt}}'"   # OFÖRÄNDRAT — inte omstartad (baseline: 2026-08-16T19:05:38Z)
ssh anderscarlius@192.168.1.220 "docker inspect core-db --format '{{.State.StartedAt}}'"          # OFÖRÄNDRAT — inte omstartad (baseline: 2026-08-16T19:03:32Z)
```

## Rollback, hela kedjan

**Provkörd live 2026-08-28** (Anders begärde en verklig drill, inte bara
en dokumenterad väg): körd efter steg 2, innan steg 3. Fynd:
`docker compose ... down -v` misslyckas med samma
`IMAGE_TAG`-interpolationsfel som CI-jobbet ursprungligen hade (fixat
där i `de8e2fa`) om `IMAGE_TAG` inte sätts — filen kräver den även för
`down`, trots att värdet är irrelevant för nedrivning. `IMAGE_TAG=rollback`
(vilket värde som helst) löser det, nu inbakat nedan. Efter fixen: full
nedrivning (båda repona + nätverket) lyckades, `ehrbase-core`/`core-db`
StartedAt-tidsstämplar oförändrade (S9 bekräftat), och en omedelbar
återuppresning (samma kommandon som steg 1–2) gav samma gröna slutläge.

```bash
ssh anderscarlius@192.168.1.220 "cd /opt/nimloth-deploy-b4/migration-gateway && IMAGE_TAG=rollback docker compose -f docker-compose.moria.yml down -v"
ssh anderscarlius@192.168.1.220 "cd /opt/nimloth-deploy-b4/nimloth-legacy-sim && IMAGE_TAG=rollback docker compose -f docker-compose.moria.yml down -v"
ssh anderscarlius@192.168.1.220 "docker network rm b4-chain"
```

`-v` är säkert här (S5) — volymerna är NYA, skapade av denna deploy,
ingen befintlig Moria-data berörs. Detta är B4-kedjans EGEN
återgångsförmåga tillämpad på sig själv: samma "ingen väg in utan en
väg tillbaka"-princip som B4 självt bevisar.
