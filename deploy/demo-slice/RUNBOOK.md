# WP-DEMO1 — Unified demo runbook

**Status:** B1-leverans (repo-only, ingen live Eldar/Moria från CI).  
**Senast uppdaterad:** 2026-10-01  
**Synthetic data only:** Fru Andersson `19500315-2384`.

---

## 1. Vad stacken ska visa (ärligt)

| Lager | I B1-demo | Kommentar |
|-------|-----------|-----------|
| Käll-DB + CDC | Ja | Melior/Asynja seed via `packages/test-data` |
| Kafka + transform | Ja | `core.clinical.observation.vitals` m.fl. |
| EHRbase + composer | Ja | OPT:er via `pnpm openehr:load-templates` + bridge |
| FHIR R4 fasad | Ja | `:3003`, `AUTH_MODE=dev` (Keycloak valfritt) |
| Iceberg Bronze | **Nej** | Medvetet OUT **2026-10-01** — P6 (`docs/ROADMAP.md`), inga `minio`/`iceberg-rest` i compose |
| OMOP Gold | **Nej** | Utanför B1 |

---

## 2. Kommandokedja — lokal unified (rekommenderad)

Kör från **repo-roten**:

```bash
export AUTH_MODE=dev
export CANONICAL_STORE=both
./deploy/demo-slice/up-local-unified.sh
```

Detta:

1. Anropar `./scripts/start.sh` (samma kedja som QUICKDEMO).
2. Kör `run-stack-health-check.sh` (EHRbase, Kafka Connect, FHIR).
3. Kör `run-aql-fhir-vitals-proof.sh` (syntetisk vital → AQL + FHIR).

### Alternativ: manuell steg-för-steg

```bash
./scripts/start.sh
./deploy/demo-slice/run-stack-health-check.sh
./deploy/demo-slice/run-aql-fhir-vitals-proof.sh
./scripts/demo-fru-andersson.sh
```

---

## 3. Kommandokedja — B4 (CI-bevis, separat scenario)

Endast **EHRbase + gateway-event-path** (anteckning/strangler), inte Fru Andersson FHIR:

```bash
# Lokalt (kräver GHCR-taggar — se workflow)
docker compose -f services/migration-gateway/deploy/ci/docker-compose.ci.yml up -d --wait
bash services/migration-gateway/deploy/ci/run-b4-chain-verification.sh
```

GitHub Actions: `migration-gateway-publish.yml` → `verify-b4-chain-from-scratch`.

Unified B1 **refererar** B4 som andra event-bevis; CIO-demo använder §2.

---

## 4. Eldar — portar och nuläge

| Tjänst | Eldar host | Moria (legacy) |
|--------|------------|----------------|
| EHRbase REST | **18124** | **11124** (ehrbase-slice overlay) |

Deploy-artefakter: `deploy/core-slice/README.md`, `deploy-ehrbase-eldar.sh`.

**B1:** unified (Kafka + FHIR + dashboard) körs **lokalt** eller framtida Eldar-slice;
denna PR deployar **inte** live på Eldar.

---

## 5. Åtkomst — Access vs lokala portar

### 5.1 Lokal demo (CIO på laptop)

| Yta | URL |
|-----|-----|
| Dashboard | http://localhost:3010 |
| FHIR | http://localhost:3003/fhir/r4/Patient?identifier=19500315-2384 |
| Kafka UI | http://localhost:8080 |
| EHRbase | http://localhost:8088/ehrbase/ |

PDL-headers (dev): se `./scripts/demo-fru-andersson.sh`.

### 5.2 Cloudflare Access (produktion/demo-host)

Publik demo (t.ex. `nimloth-demo.carlius.net`) kräver Access-inloggning — se
`docs/demo_manuscript.md` pre-flight. **B1** dokumenterar mönstret; inga tunnel-
ändringar i denna PR.

SSH port-forward (video utan intern IP): se `docs/operations/Demo_Runbook.md` §2.2.

---

## 6. AQL ↔ FHIR-bevis (syntetisk observation)

Scriptet publicerar **ett** kliniskt vital på Kafka (syntetiskt värde, unikt per körning),
väntar in composer + materializer, och verifierar:

1. **AQL** mot EHRbase — `body_temperature` med samma `magnitude`.
2. **FHIR GET** `Observation?patient=19500315-2384` — `valueQuantity.value` matchar.

```bash
./deploy/demo-slice/run-aql-fhir-vitals-proof.sh
```

---

## 7. Felsökning

| Symptom | Åtgärd |
|---------|--------|
| FHIR 401/403 | `AUTH_MODE=dev` och PDL-headers från demo-skript |
| Composer når inte EHRbase | `docker compose logs openehr-composer --tail 40` |
| Ingen Debezium | `./infra/debezium/register-connectors.sh` efter healthy connect |
| Proof timeout | Öka `PROOF_WAIT_SECS=30` före script |

---

## 8. Relaterade dokument

- [WP-DEMO1_CIO_Demo_Manus.md](../../docs/operations/WP-DEMO1_CIO_Demo_Manus.md)
- [QUICKDEMO.md](../../docs/QUICKDEMO.md)
- [deploy/core-slice/README.md](../core-slice/README.md)
