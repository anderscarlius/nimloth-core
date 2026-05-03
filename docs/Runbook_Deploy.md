# Runbook — Deploy

Operationell guide för deploy av Nimloth Core. Skapad i Sprint 2.5 B2 efter att 4.1-stuck-bugg upptäckts i P3.4 4.7.

## Lokal dev (laptop)

```bash
./scripts/start.sh                # single-node
./scripts/start.sh --distributed  # + edge-su-profil
./scripts/start-distributed.sh    # explicit distribuerat läge
```

Båda scripts kör `docker compose up -d --build` för applikationstjänster. **`--build`-flaggan krävs** för att kod-ändringar sedan senaste start ska propagera till körande containers — utan den återanvänder Docker cachad image (P3.4 4.7-incidenten, Sprint 2.5 B2). Buildx-cache gör att oförändrade tjänster rebuildar på <5s.

**Observerade rebuild-tider** (Sprint 2.5 B2 smoke-test, M4 macOS, varma cache):

| Tjänst | Rebuild-tid med ändrad TS |
|---|---:|
| `fhir-facade` | 28s |
| `openehr-composer` | 20s |

Förväntat ≤2 min för hela appstack-rebuild med varma cache. Om det tar märkbart längre — kolla buildx-cache-storlek (`docker buildx du`) och eventuellt rensa (`docker buildx prune`).

## CarliusFyra (Synology NAS) — prod-deploy

Manuell process — se [INSTALL.md sektion A](INSTALL.md#a-carliusfyra-synology-nas) för fullständig guide. Tre huvudsteg:

1. **Bygg multi-arch images** lokalt: `./scripts/build.sh --push` (kräver `DOCKER_REGISTRY`-env) eller `--load` + `docker save | ssh | docker load`
2. **Skicka images** till NAS via `docker save | gzip | ssh ... 'gunzip | docker load'` (SCP funkar inte, se synology-ops)
3. **Starta containers** på NAS via `docker compose up -d` (NAS får färdiga images, så ingen `--build`-flagga där)

Inga automatiserade webhooks eller watchtower-mekanismer. Deploy är medveten manuell process.

## CI

GitHub Actions:
- **`.github/workflows/ci.yml`** — bygger och kör tester på `pnpm -r build` + `pnpm --filter @nimloth-core/*` test. Pushar inga images. Kontrolleras vid varje PR och push till main.
- **`.github/workflows/openehr-compiler.yml`** — verifierar att `archie-all` är publicerad på Maven Central (compiler-arbete).

CI **deployer inte** till någon miljö. Det är medvetet — deploy-beslut är manuella.

## Tjänster med byggrisk (build:-baserade)

Tjänster som byggs lokalt från Dockerfile återanvänder cachad image utan `--build`. Identifierade i Sprint 2.5 B2:

```
ingest, transform, fhir-facade, cds-hooks, audit, dashboard,
terminology, mapping-assistant, openehr-composer, replication, edge,
kafka-test-producer
```

Tjänster med `image:` (postgres, kafka, schema-registry, kafka-connect, kafka-ui, keycloak, ehrbase, ehrbase-db) pull:ar versions-pinnade images från registry — ingen build-cache-bugg där.

## Snabb-felsökning: container kör gammal kod

Diagnos:

```bash
docker compose images <tjänst>            # nuvarande image-id
docker compose logs <tjänst> --tail=20    # startup-log för spårbar markör
docker compose ps <tjänst>                # status + uptime
```

Fix:

```bash
docker compose up -d --build <tjänst>     # tvinga rebuild av en tjänst
docker compose up -d --build              # tvinga rebuild av alla
```

Om `--build` inte hjälper — buildx-cache kan vara korrupt:

```bash
docker buildx prune --all                 # rensa allt cache (försiktigt — bygger om allt nästa gång)
```

## Backlog

- **B9 stängd 2026-05-03** genom denna fil. Tidigare öppna punkt om "saknad operations-checklista".
- **Framtida:** GHA-baserad image-publish till `ghcr.io/anderscarlius/*` + automatisk pull på NAS skulle eliminera Synology-stegens manuella mellanled. Inte Sprint 2.5-scope.
