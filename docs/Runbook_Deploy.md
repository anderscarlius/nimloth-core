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

## CarliusFyra (Synology NAS) — prod-deploy (legacy-väg, huvudstacken)

**Legacy-väg för huvudstacken (26 tjänster).** Dokumenterad nuvarande värd för huvudstacken är Moria — se `docs/ROADMAP.md` §"Levererade bevis efter Sprint 2" och `nimloth-docs/Portstrategi.md` §8.1 (INTE SSH-verifierad denna session). Den här sektionen behålls som historisk referens för det manuella flödet nedan. Den påverkar INTE §"cf4 — co-lokaliserade Fas 2/3-tjänster" nedan, som fortsatt är sann och oförändrad (composition-mapper, med-review, aql-template-service körs verkligen co-lokaliserat på cf4).

Manuell process — se [INSTALL.md sektion A](INSTALL.md#a-carliusfyra-synology-nas) för fullständig guide. Tre huvudsteg:

1. **Bygg multi-arch images** lokalt: `./scripts/build.sh --push` (kräver `DOCKER_REGISTRY`-env) eller `--load` + `docker save | ssh | docker load`
2. **Skicka images** till NAS via `docker save | gzip | ssh ... 'gunzip | docker load'` (SCP funkar inte, se synology-ops)
3. **Starta containers** på NAS via `docker compose up -d` (NAS får färdiga images, så ingen `--build`-flagga där)

Inga automatiserade webhooks eller watchtower-mekanismer. Deploy är medveten manuell process.

## Moria — förberedd målväg (ghcr pull-deploy)

**Dokumenterad, INTE SSH-verifierad denna session.** Bevisat mönster för 2 av 19 tjänster i `services/` — `cohort-service` och `migration-gateway`, se respektive `services/<tjänst>/deploy/RUNBOOK_DEPLOY.md` och `nimloth-docs/CICD_Tema_ghcr_2026-08-19.md`. Detta är INTE en generell huvudstack-deploy-väg än — endast dessa två tjänster är verifierat flyttade dit. Övriga 17 tjänster saknar `deploy/`-motsvarighet. Se `docs/ROADMAP.md` §"Levererade bevis efter Sprint 2" för B4a/B7 nivå 1-status.

## cf4 — co-lokaliserade Fas 2/3-tjänster (intern backend + Access-gated demo)

Fas 2 + Fas 3 introducerade **statslösa** tjänster som körs **co-lokaliserade
på cf4 (CarliusFyra)** bredvid EHRbase, så att agent→AQL→EHRbase blir loopback
över docker-nätet `core`:

| Container | LAN-port | Internport | Roll |
|---|---:|---:|---|
| `aql-template-service-core` | 11402 | 3010 | Fas 2 AQL-mall-tjänst (Kontrakt 1) |
| `med-review-core` | 11403 | 3011 | Fas 3 med-review-orkestrator (SSE) |
| `nimloth-demo` | 11005 | 80 | Fristående demo-yta (nginx statisk + reverse-proxy) |

- **`nimloth-demo`** (container_name; compose-tjänst `dashboard-demo`) = statisk vite-build (nginx) av AI-medicineringsgenomgång-demon (`/med-review` = screening · patientregister · genomgång; `/compose-demo`). Reverse-proxar `/api/med-review` (SSE, `proxy_buffering off`) + `/api/aql-templates` till tjänsterna ovan. Bygg `services/dashboard/Dockerfile.demo` + `nginx.conf`. **Gotcha:** `absolute_redirect off` (annars tappar root→/med-review-redirecten porten). Skild från dev-tjänsten `dashboard`. Screening-snapshot: `dashboard/public/screening-results.json` (regen via `med-review/src/scripts/screen-population.ts`).
- **Cloudflare-tunnel (LIVE):** `nimloth-demo` ligger på BÅDE `nimloth-core` (når backend-tjänsterna) OCH `carlius-net` (där cloudflared bor) → tunnel-ingress `service: http://nimloth-demo:80` (docker-DNS, syskon till `nimloth-atlas:80`). Publikt på **`nimloth-demo.carlius.net`** bakom **Cloudflare Access (Zero Trust)** — verifierat. Access skyddar både mock-auth-gapet och `ANTHROPIC_API_KEY`-kostnaden. Ta ALDRIG bort Access-gaten utan att först åtgärda mock-auth.

- **`med-review-core` använder cf4:s `ANTHROPIC_API_KEY`** (compose: `${ANTHROPIC_API_KEY:-}`) för Claude-syntes. Nyckeln ligger i cf4-env — **checkas aldrig in, echo:as aldrig**. `MED_REVIEW_SYNTH_MODEL` default `claude-opus-4-7`.
- **Backend-tjänsterna (`med-review` 11403, `aql-template` 11402) är INTERNA** — ingen egen publik tunnel; nås bara på LAN + av demo-ytan internt. Demo-ytan `nimloth-demo` ÄR publikt tunnlad men **bakom Cloudflare Access** (se nedan). mock-auth-skulden (`aql-template-service/src/middleware/mock-auth.ts`) är därmed **mitigerad av Access, inte löst** — publik UTAN Access kräver fortfarande att den åtgärdas.
- **Co-location är INTE en latensfix** (AC1-benchmark falsifierade det — topologi ≠ flaskhalsen; bounded/stegad hämtning är spaken). Behålls som golv + intern säkerhet.

### Deploy / omstart (skiljer sig från images-flödet ovan)

Dessa byggs **på cf4** från synkad källa, inte via `docker save | ssh`:

```bash
# 1. Synka källa till cf4 (ingen SCP — tar+pipe)
cd services/med-review && tar czf - src | \
  ssh cf4 'cd /volume2/docker/nimloth-core/services/med-review && tar xzf -'

# 2. Bygg + (åter)starta ENDAST dessa två tjänster
ssh cf4 'set +e; cd /volume2/docker/nimloth-core && \
  /usr/local/bin/docker-compose build med-review && \
  /usr/local/bin/docker-compose up -d med-review'
```

⚠️ **Omstart av dessa två rör INTE EHRbase-stacken.** De är statslösa och
återansluter bara till EHRbase över docker-nätet — populationen (1005 EHR) ligger
i EHRbase-volymer och påverkas inte. **Kör ALDRIG `reset-ehrbase.sh` / volym-wipe
som del av en med-review/aql-template-omstart.**

Synology-gotchas: `docker-compose` = `/usr/local/bin/docker-compose` (bindestreck),
docker under ContainerManager-sökvägen, `set +e`, ingen SCP. Repo på cf4:
`/volume2/docker/nimloth-core`.

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
