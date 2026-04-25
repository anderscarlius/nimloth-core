# Prompt P6 — Lakehouse (bronze + silver + OMOP gold)


## Kontext

All data-flöde är primärklinik. Ingen sekundär väg, ingen OMOP-bro.

## Mål

Bronze/silver/gold ovanpå Kafka. Bronze = rå CDC + clinical i Parquet/Iceberg. Silver = domän-events per resurstyp. Gold = OMOP CDM 5.4. Query-motor: DuckDB.

## Leverans

- Containers `minio`, `iceberg-rest`
- `services/lakehouse-bronze/`, `services/lakehouse-silver/`, `services/lakehouse-gold-omop/` (alla `@nimloth-core/*`)
- Endpoint `GET /api/v1/secondary-data/omop`
- Ny Datakvalitet-vy

## Steg

1. MinIO + Iceberg REST:
   ```yaml
   minio:
     image: minio/minio
     ports: ["9000:9000", "9001:9001"]
     command: server /data --console-address ":9001"
   iceberg-rest:
     image: tabulario/iceberg-rest
     ports: ["8181:8181"]
   ```
2. `services/lakehouse-bronze/`:
   - Konsumerar `vgr.cdc.*` (CDC från källor) + `core.clinical.*` (vårt schema)
   - Skriver till Iceberg `bronze.cdc_events` och `bronze.clinical_events`
   - Batch-write var 60s eller 1000 events
3. `services/lakehouse-silver/`:
   - Konsumerar `core.clinical.*`
   - En tabell per event-typ: `silver.observations`, `silver.medications`, etc.
   - Partitionering: `date(occurred_at)`
4. `services/lakehouse-gold-omop/`:
   - Daglig batch: silver → OMOP CDM 5.4
   - `silver.patients` → `gold.person`
   - `silver.observations` → `gold.observation` + `gold.measurement` (per LOINC-kategori)
   - `silver.medications` → `gold.drug_exposure`
   - `silver.conditions` → `gold.condition_occurrence`
   - `silver.procedures` → `gold.procedure_occurrence`
   - `silver.encounters` → `gold.visit_occurrence`
   - OMOP-ATHENA-vokabulär laddat i `gold.concept` (bootstrap)
5. Query-endpoint i FHIR Facade:
   - `GET /api/v1/secondary-data/omop?cohort=<sql>` → DuckDB mot gold → CSV/JSON
   - PDL-checkpoint: kräver `purpose=RESEARCH`. Audit till `core.audit.secondary-access`.
6. Datakvalitet-vy (`pages/Quality.tsx`):
   - Bronze: antal events, senaste skrivning, storlek
   - Silver: 7 tabeller, patienter, observationer, etc
   - Gold: OMOP 5.4, persons, drug_exposures, condition_occurrences
   - Tidsserier: ingest-rate per lager per timme
7. Demo `scripts/demo-omop-analytics.sh`:
   ```sql
   SELECT COUNT(*) FROM person p
   JOIN drug_exposure d ON d.person_id = p.person_id
   WHERE d.drug_concept_id IN (/* Waran */)
   ```

## Acceptans

- Bronze efter 5 min: `duckdb -c "SELECT COUNT(*) FROM bronze.cdc_events"` > 0
- Silver efter 10 min: `silver.observations` > 0
- Gold efter daglig batch: `gold.person` ≥ 14
- Datakvalitet-vy visar non-zero-tal
- `curl "http://localhost:3003/api/v1/secondary-data/omop?cohort=..."` returnerar JSON
- `services/cds-hooks/` har INGEN import från `services/lakehouse-*`

## Tekniska noteringar

- **Språkval:** Python mer moget för Iceberg + OMOP. Överväg Python-tjänster trots TS-resten.
- **OMOP vocabulary:** ~5 GB. One-time bootstrap i named volume `omop-vocab`.
- **Partitionering:** `date(occurred_at)` för time-series; `hash(person_id, 4)` för person.
- **DuckDB + Iceberg:** verifiera DuckDB 1.0+ med `iceberg`-extension.

**Dependencies:** inga.

---

