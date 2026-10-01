# core-slice deploy

Isolerade Docker Compose-slices för Nimloth Core — **inte** samma sak som root
`docker-compose.yml` eller frysta `/opt/nimloth-core` på Moria.

## Hoststrategi (2026-10-01)

| Host | Roll | EHRbase-slice |
|------|------|----------------|
| **Eldar** (`192.168.1.230`) | Primärt deploymål för **nya** slices | `ehrbase-only` + `eldar`-overlay, host **`:18124`** |
| **Moria** (`192.168.1.220`) | Legacy — fru-andersson + befintlig ehrbase **`:11124`** orörd | `docker-compose.moria.yml` + `docker-compose.ehrbase-slice.yml` |

Lätta Moria: deploya inte om legacy-stacken när Eldar används för nya experiment.

## Eldar — endast EHRbase + databas

Filer:

- `docker-compose.ehrbase-only.yml` — fristående `ehrbase-db` + `ehrbase` (pinnade digests som huvudstacken).
- `docker-compose.eldar.yml` — publicerar **18124→8080** (undviker **18081**, verkstad-webb).
- `deploy-ehrbase-eldar.sh` — pull/up/status/down/smoke på **target-host**.
- `smoke-ehrbase-eldar.sh` — health + syntetisk OPT-load.
- `.env.eldar.example` — valfria overrides (inga secrets).

### Operatör på Eldar

1. Skapa deploy-mapp (förslag):

   ```bash
   sudo mkdir -p /opt/nimloth-deploy-ehrbase-eldar
   sudo chown "$USER:$USER" /opt/nimloth-deploy-ehrbase-eldar
   ```

2. Från utvecklingsmaskin (scp/rsync — **inte** obligatoriskt i CI):

   ```bash
   rsync -av deploy/core-slice/docker-compose.ehrbase-only.yml \
             deploy/core-slice/docker-compose.eldar.yml \
             deploy/core-slice/deploy-ehrbase-eldar.sh \
             deploy/core-slice/smoke-ehrbase-eldar.sh \
             anderscarlius@192.168.1.230:/opt/nimloth-deploy-ehrbase-eldar/
   ```

   För full OPT-smoke utan checkout på Eldar, kopiera också:

   ```bash
   rsync -av infra/openehr/test-fixtures/ehrbase-test-minimal-action.opt \
             anderscarlius@192.168.1.230:/opt/nimloth-deploy-ehrbase-eldar/
   # På Eldar: OPT_FILE=/opt/nimloth-deploy-ehrbase-eldar/ehrbase-test-minimal-action.opt ./smoke-ehrbase-eldar.sh
   ```

3. På Eldar:

   ```bash
   cd /opt/nimloth-deploy-ehrbase-eldar
   chmod +x deploy-ehrbase-eldar.sh smoke-ehrbase-eldar.sh
   ./deploy-ehrbase-eldar.sh bootstrap
   ./deploy-ehrbase-eldar.sh pull
   ./deploy-ehrbase-eldar.sh up
   ./deploy-ehrbase-eldar.sh smoke
   ```

4. Manuell curl (utan fixture):

   ```bash
   curl -sfS http://127.0.0.1:18124/ehrbase/
   ```

### Portar

| Tjänst | Eldar (host) | Container |
|--------|----------------|-----------|
| EHRbase REST | **18124** | 8080 |
| ehrbase-db | (ingen host-port) | 5432 |

## Moria — fru-andersson-slice

Se `deploy.sh` och `docker-compose.moria.yml`. Runbook:
`nimloth-docs/NOW_Block8_FruAnderssonSlice_forberedelse.md` (om filen finns i din checkout).

EHRbase **på Moria** via fragment (kräver fru-andersson-bas):

```bash
docker compose -f docker-compose.moria.yml -f docker-compose.ehrbase-slice.yml up -d ehrbase-db ehrbase
```

Host-port **11124** (core-slice), inte Eldar 18124.

## Medvetet utanför denna slice

- **E9** — `openehr-composer` saknar ghcr-publish-workflow; inte med i Eldar ehrbase-only.
- **E11** — `CANONICAL_STORE=both` / ParityRunner kräver fru-andersson + fhir-facade; separat arbete.
- **Cloud agent** — ingen SSH till Eldar/LAN från CI; validering via `docker compose config` i CI.

## Validering lokalt / CI

```bash
cd deploy/core-slice
docker compose -f docker-compose.ehrbase-only.yml -f docker-compose.eldar.yml config
./deploy-ehrbase-eldar.sh bootstrap
```
