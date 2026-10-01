# WP-DEMO1 — Unified demo-slice (Fas B1)

Ett **demomanus + kommandokedja** som matchar Nimloth-stacken på sajten utan att
överdriva vad som faktiskt körs: syntetisk patient, EHRbase, minst en
event-väg (Kafka/CDC eller dokumenterad B4-kedja), FHIR-fasad, dashboard.

**Denna PR:** compose/runbook/CI-bevis i repo. **Ingen** live-deploy på Eldar
eller Moria (operatör kör separat efter Anders ja).

## Snabbstart (lokal unified stack)

```bash
# Från repo-roten — tar ~5–15 min första gången (Docker build)
./deploy/demo-slice/up-local-unified.sh

# Endast bevis AQL ↔ FHIR (stack redan igång)
./deploy/demo-slice/run-aql-fhir-vitals-proof.sh
```

Standardportar (root `docker-compose.yml`, utan override):

| Yta | URL |
|-----|-----|
| Dashboard | http://localhost:3010 |
| FHIR R4 | http://localhost:3003/fhir/r4 |
| EHRbase REST | http://localhost:8088/ehrbase |
| Kafka UI | http://localhost:8080 |
| Keycloak (demo `AUTH_MODE=dev`) | http://localhost:8180 |

Med `docker-compose.override.yml` (parallell nimloth-flow): portar auto-detekteras
via `.start-env` efter `./scripts/start.sh`.

## Vad som ingår / medvetet OUT

| Ingår i B1-demo | OUT (med datum) |
|-----------------|-----------------|
| EHRbase + openehr-composer + Kafka/CDC → transform → FHIR materializer | **Iceberg Bronze** — medvetet OUT **2026-10-01** (P6 lakehouse ej i compose; se RUNBOOK) |
| Syntetisk patient **Fru Andersson** (`19500315-2384`) | Prod-patientdata |
| Bevis: AQL + FHIR GET samma numeriska vital | Better-klon, full Gold/OMOP |
| `./scripts/demo-fru-andersson.sh` (FHIR/CDS/audit) | Moria legacy `/opt/nimloth-core` |
| Eldar **ehrbase-only** `:18124` (återanvänder `deploy/core-slice/`) | SSH/live från cloud agent |

## Filer

| Fil | Syfte |
|-----|--------|
| [INVENTORY.md](./INVENTORY.md) | Fas A — befintliga slices |
| [RUNBOOK.md](./RUNBOOK.md) | Operatör: res kedja, Access, Eldar-portar |
| [up-local-unified.sh](./up-local-unified.sh) | Reser lokal unified + kör bevis |
| [run-stack-health-check.sh](./run-stack-health-check.sh) | EHRbase + event-path + FHIR |
| [run-aql-fhir-vitals-proof.sh](./run-aql-fhir-vitals-proof.sh) | AQL ↔ FHIR samma observation |
| [publish-synthetic-vital.ts](./publish-synthetic-vital.ts) | En Kafka-vital (syntetisk) |

## CI

`/.github/workflows/ci.yml` kör `bash -n` på skripten och `docker compose config`
på demo-slice-referenser. Full E2E-stack körs lokalt eller på operatörsmaskin —
inte på GitHub-hosted runner (resurs/tid).

## Relaterat

- [docs/operations/WP-DEMO1_CIO_Demo_Manus.md](../../docs/operations/WP-DEMO1_CIO_Demo_Manus.md) — ≤30 min CIO
- [docs/QUICKDEMO.md](../../docs/QUICKDEMO.md) — Fru Andersson UI-demo
- B4-kedja CI: `services/migration-gateway/deploy/ci/` + workflow `verify-b4-chain-from-scratch`
