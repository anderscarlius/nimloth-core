# Prompt P1 — Terminologitjänst (Snowstorm + HAPI)


## Kontext

`services/transform/src/terminology.ts` innehåller hårdkodade lookup-tabeller för mappning mellan lokala källkoder (SU-LOCAL, AsynjaVisph-LOCAL) och standardkodsystem (SNOMED CT, LOINC, ICD-10-SE, ATC). Ärvt från Nimloth Flow. Fungerar för Fru Andersson-scenariot men är inte produktionsmässig arkitektur.

## Mål

Ersätt hårdkodade tabeller med tjänste-baserad lösning där terminologi hämtas från Snowstorm (SNOMED) och HAPI FHIR Terminology (LOINC, ICD-10-SE), bakom en tunn egen proxy `services/terminology/`. Bibehåll fallback så demot fungerar när upstream är nere.

## Leverans

- Container `snowstorm` i `docker-compose.yml`
- Container `hapi-fhir-terminology` med LOINC + ICD-10-SE
- Ny tjänst `services/terminology/`
- Migrerade mappers i `services/transform/src/mappings/*.ts`
- Ny rad "Terminologi" i dashboardens Systemstatus-vy

## Steg

1. Lägg till Snowstorm-container i `docker-compose.yml` (port 8090). `snomedinternational/snowstorm-lite:latest` trimmad till ~20 subseter. Target ≤100 MB.
2. Lägg till HAPI FHIR JPA-container (port 8091) med startup-init som laddar LOINC-subset + ICD-10-SE.
3. Skapa `services/terminology/` (Express + TypeScript, mönster från `services/audit/`). Endpoints:
   - `POST /translate` — `{ source, target, code }` → `{ code, display, system }`
   - `POST /expand` — `{ url }` (ValueSet canonical URL) → `Parameters`-bundle
   - `POST /lookup` — `{ system, code }` → `{ display, designations }`
4. Implementera Redis-cache (eller in-memory LRU) med TTL 24h. Cache-miss → upstream. Upstream-fel → fallback till hårdkodade tabeller från `data/terminology-fallback.json`.
5. Migrera alla sju mappers till att anropa `terminologyClient.translate(...)` istället för lokala lookups. Behåll `terminology.ts` som fallback-data.
6. Lägg till `/system-status/terminology` endpoint.
7. Uppdatera dashboardens `pages/SystemStatus.tsx`.

## Acceptans

- `./scripts/start.sh && ./scripts/demo-fru-andersson.sh` fungerar oförändrat.
- `curl -s -X POST http://localhost:3008/translate -d '{"source":"SU-LOCAL","target":"SNOMED","code":"SU-ALLERG-PENV"}'` returnerar SNOMED-koden.
- Stopp av Snowstorm: `docker compose stop snowstorm` → demon fortsätter (fallback aktiv).
- Dashboardens Systemstatus visar "Terminologi" med antal laddade koder.

## Tekniska noteringar

- Snowstorm-lite valt över full Snowstorm (full: 2+ GB minne).
- LOINC-laddning via `$upload-external-code-system` eller bootstrap-script.
- Fallback-JSON genereras genom att serialisera nuvarande `terminology.ts` en gång. Commits i repo:t.
- Port: 3008.

**Dependencies:** inga. Kan köras först.

---

