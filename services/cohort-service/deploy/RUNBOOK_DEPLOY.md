# Deploy-runbook — cohort-service till Moria

**Sedan:** CI/CD-temat, 2026-08-19. Ersätter cohort-service-delen av den
hand-underhållna `/opt/nimloth-core-ku/docker-compose.ku.yml` på Moria.
`omop-projector` (samma gamla fil) rörs inte — den är en CLI/batch-tjänst,
utanför detta ärendes scope.

## Drift-regel — läs innan du kör

Samma regel som `nimloth-compose/deploy/RUNBOOK_DEPLOY.md`: filerna i
`/opt/cohort-service-deploy/` på Moria är **engångskopior**, redigeras
aldrig på plats. Källan är alltid detta repo. `deploy.sh` loggar sin
käll-SHA och compose-filens sha256-hash vid varje körning.

## Engångsförberedelse — registry-token

Delad med nimloth-compose: `/opt/nimloth-deploy/.env` (`GHCR_USER`/
`GHCR_PAT`, classic PAT med enbart `read:packages`). En rotationspunkt
för båda tjänsterna — se nimloth-compose-repots runbook för procedur.

## Pensionerad healthcheck-override

`localhost`→`127.0.0.1`-fixen (triage 2026-08-18: imagens `localhost`
resolvar IPv6 först, appen binder bara IPv4) är nu inbakad i
`Dockerfile`s `HEALTHCHECK` direkt. Den tidigare ospårade
`/opt/nimloth-core-ku/docker-compose.moria.yml`-overriden på Moria är
därför överflödig — tas bort i samma Fas C-deploy som denna väg tas i
bruk (se grind 2-anteckningarna för exakt kommando).

## Deploy

```bash
GIT_SHA=$(git rev-parse --short=7 HEAD)
IMAGE_TAG="sha-${GIT_SHA}"

ssh nsf-moria "mkdir -p /opt/cohort-service-deploy"
scp services/cohort-service/deploy/docker-compose.moria.yml \
    services/cohort-service/deploy/deploy.sh \
    nsf-moria:/opt/cohort-service-deploy/
ssh nsf-moria "chmod +x /opt/cohort-service-deploy/deploy.sh"

ssh nsf-moria "cd /opt/cohort-service-deploy && IMAGE_TAG=${IMAGE_TAG} DEPLOY_SOURCE_SHA=$(git rev-parse HEAD) ./deploy.sh"
```

## Verifiering efter deploy

```bash
ssh nsf-moria "docker inspect cohort-service-core --format '{{index .Config.Labels \"org.opencontainers.image.revision\"}}'"
ssh nsf-moria "docker inspect cohort-service-core --format '{{.State.Health.Status}}'"
ssh nsf-moria "curl -sS http://127.0.0.1:11111/healthz"
```

Revision-labeln ska matcha `git rev-parse HEAD`, health-status ska bli
`healthy` inom `start_period` (20s), och `/healthz` ska svara
`{"status":"ok",...}`.

## Rollback

```bash
ssh nsf-moria "cd /opt/cohort-service-deploy && IMAGE_TAG=<föregående-tagg> DEPLOY_SOURCE_SHA=rollback ./deploy.sh"
```

## Efter denna deploy: rensa den gamla KU-compose-filen

`/opt/nimloth-core-ku/docker-compose.ku.yml` på Moria innehåller
fortfarande en `cohort-service`-tjänstedefinition som nu är överflödig
(container-namnet `cohort-service-core` tas över av den nya vägen).
Ta bort den blocket ur den gamla filen manuellt (behåll `omop-projector`
och `networks`-blocket) så ingen råkar köra `docker-compose -f
docker-compose.ku.yml up -d` därifrån och skapar en namnkonflikt. Detta
är en avsiktlig, engångs-redigering av en redan hand-underhållen fil —
inte ett brott mot engångskopia-regeln ovan (den gäller de NYA filerna
i `/opt/cohort-service-deploy/`).
