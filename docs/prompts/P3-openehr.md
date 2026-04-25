# Prompt P3 — openEHR parallellt kanoniskt lager


## Kontext

`core-db` har tabeller som speglar FHIR-resurser (ärvt från Nimloth Flow). Artikel 6 argumenterar emot detta mönster. Vi vill införa openEHR parallellt utan att ta bort befintligt.

## Mål

EHRbase parallellt med `fhir_*`-tabeller. Ny `services/openehr-composer/` konsumerar `core.clinical.*` och skriver compositions. FHIR Facade får `CANONICAL_STORE`-flag som växlar. Diff-endpoint visar paritet.

## Leverans

- Container `ehrbase`
- `openehr/templates/` med 7 minimala templates
- Ny tjänst `services/openehr-composer/`
- `CANONICAL_STORE`-flag i `services/fhir-facade/`
- AQL-till-FHIR-översättning i Facade
- `GET /fhir/r4/Patient/{id}/$everything?store=both`

## Steg

1. EHRbase-container i `docker-compose.yml`:
   ```yaml
   ehrbase:
     image: ehrbase/ehrbase:latest
     ports: ["8080:8080"]
     environment:
       DB_URL: jdbc:postgresql://ehrbase-db:5432/ehrbase
     depends_on:
       ehrbase-db: { condition: service_healthy }
   ehrbase-db:
     image: ehrbase/ehrbase-postgres:latest
     environment:
       POSTGRES_USER: ehrbase
       POSTGRES_PASSWORD: ehrbase
   ```
2. Skapa `openehr/templates/` med 7 OPT-templates:
   - `vital-signs-blood-pressure.opt` (bas: `openEHR-EHR-OBSERVATION.blood_pressure.v2`)
   - `vital-signs-pulse.opt`
   - `vital-signs-body-temperature.opt`
   - `medication-statement.opt`
   - `adverse-reaction.opt`
   - `procedure.opt`
   - `problem-diagnosis.opt`
3. Ladda templates via init-script: POST till `/ehrbase/rest/ecis/v1/template`.
4. Skapa `services/openehr-composer/` (package: `@nimloth-core/openehr-composer`):
   - Konsumerar `core.clinical.*`.
   - Varje event mappas till composition via template.
   - POST till `/ehrbase/rest/openehr/v1/ehr/{ehrId}/composition`.
   - Varje patient har `ehrId` i EHRbase — skapa vid första composition, cache i Postgres.
5. `CANONICAL_STORE`-env i Facade:
   - `postgres` (default) — befintlig kodväg.
   - `openehr` — ny, översätter FHIR-queries till AQL.
6. `services/fhir-facade/src/stores/openehr-store.ts`:
   - `getPatient(id)` → `SELECT e/ehr_status/subject FROM EHR e WHERE e/ehr_id/value = $id`
   - `getObservations(patientId, category)` → AQL mot composition-tagg
   - `$everything(patientId)` → union av AQL-queries
7. `?store=both` på `$everything`: kör båda, returnera `{ postgres: Bundle, openehr: Bundle, diff: [...] }`.
8. `CanonicalStoreBadge` i PatientOverview. Konfigurerbar via `?store=openehr`.

## Acceptans

- `CANONICAL_STORE=postgres ./scripts/start.sh && ./scripts/demo-fru-andersson.sh` grönt (befintligt).
- `CANONICAL_STORE=openehr ./scripts/start.sh && ./scripts/demo-fru-andersson.sh` grönt (nytt).
- `curl -s "http://localhost:3003/fhir/r4/Patient/1/\$everything?store=both"` returnerar båda + diff.
- Diff tom eller bara tekniska skillnader (IDs, timestamps).
- EHRbase UI på `/ehrbase/swagger-ui/` visar 7 templates.

## Tekniska noteringar

- EHRbase behöver PostgreSQL 13+. Egen instans `ehrbase-db`.
- OPT-templates genereras från CKM via Archetype Designer.
- ~300 MB RAM för EHRbase (Java heap).

**Dependencies:** inga.

---

