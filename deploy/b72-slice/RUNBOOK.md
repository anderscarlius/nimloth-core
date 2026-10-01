# WP-B72 — Hel stack från noll (runbook)

**Status:** repo-only. **Synthetic data only** (Fru Andersson `19500315-2384`).  
**Senast uppdaterad:** 2026-10-01

> **Kräver Anders-ja:** all live deploy på **Eldar** (`192.168.1.230`) eller
> **Moria** utöver det som redan är dokumenterat som operatörssteg. Cloud agents
> och GitHub Actions **SSH:ar inte** till LAN.

---

## 1. Vad “healthy” betyder (B72 minimal)

Tier A-spine (se `SERVICE_LIST.md`):

- EHRbase svarar på REST-root
- Minst en Debezium-connector registrerad (CDC event-path)
- Kafka-topic `core.clinical.observation.vitals` finns
- `fhir-facade` `/health` OK

Valfritt Tier B: domain-events-profil, AQL↔FHIR-bevis (WP-DEMO1).

---

## 2. Lokal — från noll (rekommenderad B72-väg)

Kör från **repo-roten** på en maskin med Docker + pnpm:

```bash
export AUTH_MODE=dev
export CANONICAL_STORE=both
./deploy/b72-slice/from-scratch-local.sh
```

Detta:

1. `./scripts/start.sh` — infra, topics, connectors, seed, templates, apptjänster (**build**, inte ghcr).
2. `smoke-b72-health.sh` — spine asserts.
3. (Valfritt) `./deploy/demo-slice/run-aql-fhir-vitals-proof.sh` — AQL↔FHIR.

### Domain events + lakehouse interim (Tier B)

```bash
docker compose --profile domain-events up -d domain-event-audit-sink domain-event-lakehouse-stub
./scripts/wp-lh1-bronze-silver-smoke.sh   # offline/contract — ingen Docker krävs
```

### Stopp / reset

```bash
./scripts/stop.sh
# eller full wipe:
./scripts/reset.sh
```

---

## 3. CI-facit (ingen hemlighet, ingen full Docker-stack på GHA)

| Bevis | Var |
|-------|-----|
| B72 compose + skript | `ci.yml` → `./scripts/wp-b72-ci-facit.sh` |
| B7 nivå 1 B4 E2E | `migration-gateway-publish.yml` → `verify-b4-chain-from-scratch` |
| Eldar ehrbase compose | `ci.yml` → `docker compose … ehrbase-only + eldar` |
| openEHR CI nivå 2 | `openehr-ci-level2.yml` |
| WP-DEMO1 skript | `bash -n` i `ci.yml` |

Lokal repro av CI-facit:

```bash
./scripts/wp-b72-ci-facit.sh
```

---

## 4. GHCR host-deploy (delvis — inte hela Tier A)

Endast tjänster med **riktiga** publish-workflows kan pull-deployas utan
lokal build. För fru-andersson-skissen (postgres-only canonical, **inte**
full B72 `CANONICAL_STORE=both`):

```bash
cd deploy/core-slice
export IMAGE_TAG_FHIR_FACADE=sha-<kort-sha-från-main>
# Övriga IMAGE_TAG_* kräver workflows som inte finns än — se SERVICE_LIST.md
docker login ghcr.io   # operatör — PAT utanför git
./deploy.sh pull fhir-facade
./deploy.sh up fhir-facade
```

**B72-minimal på host idag:** använd §2 (lokal build) eller vänta på fler ghcr-workflows.

---

## 5. Eldar — primärt målhost

### 5.1 Idag (E8): EHRbase-only

| Tjänst | Host-port |
|--------|-----------|
| EHRbase REST | **18124** |

```bash
# På Eldar (efter rsync — se deploy/core-slice/README.md)
cd /opt/nimloth-deploy-ehrbase-eldar
./deploy-ehrbase-eldar.sh bootstrap
./deploy-ehrbase-eldar.sh pull
./deploy-ehrbase-eldar.sh up
./deploy-ehrbase-eldar.sh smoke
```

**Kräver Anders-ja** innan första deploy eller portändring.

### 5.2 Framtida: unified B72 på Eldar

**Inte implementerat i denna PR.** Plan:

1. Anders godkänner portar utöver 18124 (Kafka, FHIR, …).
2. Operatör rsync:ar `deploy/b72-slice/` + compose-fragment (TBD).
3. GHCR-taggar för `fhir-facade` (minst); pipeline-tjänster tills workflows finns.

Tills dess: Tier A körs **lokalt** (`from-scratch-local.sh`).

---

## 6. Moria — medvetet inte expanderad

- Legacy stack `/opt/nimloth-core` — **fryst**, inte sanning (se `CLAUDE.md`).
- Nya experiment: isolerade slices under `deploy/core-slice/`, inte omstart av legacy.
- B4 gateway: `services/migration-gateway/deploy/moria/` (separat scenario).

---

## 7. B4-kedja (B7 nivå 1 — komplement, inte B72-spine)

```bash
docker compose -f services/migration-gateway/deploy/ci/docker-compose.ci.yml up -d --wait
bash services/migration-gateway/deploy/ci/run-b4-chain-verification.sh
```

Kräver ghcr-taggar lokalt om du inte kör via GitHub Actions.

---

## 8. Felsökning

| Symptom | Åtgärd |
|---------|--------|
| Inga connectors | `./infra/debezium/register-connectors.sh` efter healthy kafka-connect |
| FHIR unhealthy | `docker compose logs fhir-facade --tail 50` |
| EHRbase 404 templates | `pnpm openehr:load-templates` / bridge (körs i `start.sh`) |
| Eldar smoke utan OPT | Sätt `OPT_FILE=` till kopierad fixture (core-slice README) |

---

## 9. Relaterat

- [SERVICE_LIST.md](./SERVICE_LIST.md)
- [spec/wp-b72-hel-stack-fran-noll.md](../../spec/wp-b72-hel-stack-fran-noll.md)
- [deploy/demo-slice/RUNBOOK.md](../demo-slice/RUNBOOK.md)
- [deploy/core-slice/README.md](../core-slice/README.md)
