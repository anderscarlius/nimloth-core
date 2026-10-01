# WP-LH1 — Lakehouse Bronze→Silver smoke (Fas B4)

**Status:** implementerat (smoke, dataklass 0).  
**Planreferens:** Smedjan Plan Bygg och Spec 2026-10-01, § B4.  
**Bygger på:** WP-EVT1 (`CompositionCommitted` v1) + kliniska vitals på
`core.clinical.observation.vitals` för join till silver.

## Syfte

Bevisa att domänhändelser kan landa **append-only** i bronze och att minst en
openEHR-path kan **tillplattas** till silver — utan Gold/OMOP, utan patient-PHI
i git, och utan att påstå Iceberg i unified demo (WP-DEMO1).

## Acceptans (mappning)

| Punkt | Implementation |
|-------|----------------|
| 1. Bronze append-only raw (syntetisk) | `domain-event-lakehouse-stub` skriver NDJSON till volym (`LAKEHOUSE_BRONZE_PATH`). Full `CompositionCommitted` i `raw` + proveniens. **Avtalad interim store** tills MinIO/Iceberg (P6) aktiveras. |
| 2. Silver ≥1 openEHR-path | `silver-body-temperature.ndjson` med kolumn `openehr_path` = `…/items[at0004]/value/magnitude` och `magnitude` från join mot vitals-cache. |
| 3. Proveniens | `provenance.source_system`, `provenance.event_timestamp`, `provenance.template_id` (+ trigger ids) på båda lager. |
| 4. Dataklass 0 | `data_class: 0` på bronze/silver; endast syntetiska personnummer från demo. |
| 5. Runbook | `deploy/lakehouse-slice/RUNBOOK.md` |

## Komponenter

| Artefakt | Roll |
|----------|------|
| `packages/lakehouse-pipeline` | Delad logik: bronze-record, silver flatten, vitals-cache, unit/offline-smoke |
| `services/domain-event-lakehouse-stub` (:3021) | Kafka-konsument: domain topic + vitals topic → bronze + silver NDJSON |
| `scripts/wp-lh1-bronze-silver-smoke.sh` | CI/lokal offline-smoke (ingen Docker) |
| `deploy/lakehouse-slice/RUNBOOK.md` | Operatör: offline + valfri Kafka-stack |

## Medvetet OUT (LH1)

- Iceberg REST + MinIO i default demo-compose (documenterad väg i P6)
- Gold / OMOP / register (LH2)
- Federation, Eldar/Moria live-deploy
- Patientdata i git

## Avvecklingsväg

När P6 MinIO/Iceberg landar: byt `store`-fält och writer i stub till Iceberg
append; behåll samma `lakehouse-pipeline`-kontrakt för silver-transform.
