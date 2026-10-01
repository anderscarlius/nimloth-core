# WP-FHIR1 — FHIR SE + SMART stub (Fas B2)

Status: levererad i `fhir-facade` (AUTH_MODE=dev). Dataklass 0, syntetisk testdata.

## FHIR som transport, openEHR som persistens

| Lager | Roll | Nimloth-komponent |
|-------|------|-------------------|
| **Transport / API** | Externa klienter (dashboard, SMART-appar, integrationer) talar FHIR R4 JSON | `services/fhir-facade` under `/fhir/r4` |
| **Persistens (CDR)** | Kliniska kompositioner lagras i EHRbase; personnummer→EHR-id i `openehr_ehr_cache` (composer) | EHRbase + AQL-broker i `OpenehrStore` |
| **Projektion (valfri)** | Kafka→postgres materialiserar FHIR-tabeller för edge/legacy-läsning | `Materializer` när `CANONICAL_STORE=postgres` |

**Happy path mot CDR:** sätt `CANONICAL_STORE=openehr` (eller `both` för paritet). Läsning går då via AQL mot EHRbase — inte via tom mock eller postgres-fallback när cache + EHRbase finns.

Postgres-läge är fortfarande default för bakåtkompatibilitet; demo/Eldar-slices som ska visa Fru Andersson från composer bör använda `openehr`.

## Endpoints (runtime)

| Yta | URL (default port 3003) |
|-----|-------------------------|
| FHIR base | `GET /fhir/r4/metadata` |
| Patient | `GET /fhir/r4/Patient/{pnr}` |
| Vitals | `GET /fhir/r4/Observation?patient={pnr}&category=vital-signs` |
| SMART well-known | `GET /.well-known/smart-configuration` |
| Dev launch seed | `POST /smart/dev/launch` JSON `{ "patient", "practitioner"? }` |
| Authorize | `GET /smart/authorize?...` |
| Token | `POST /smart/token` |
| Context | `GET /smart/context` med `Authorization: Bearer …` |

Auth i dev: `AUTH_MODE=dev` (default) — `X-User-HSA` / Bearer-as-HSA; PDL-headers enligt `spec/dp-in2-inera-stack.md`.

## SMART launch (dev-stub)

1. `POST /smart/dev/launch` → `launch` id (ersätter EHR-utfärdat launch i dev).
2. Appen anropar `/smart/authorize` med `launch`, `client_id`, `redirect_uri`, `response_type=code`.
3. `POST /smart/token` med `authorization_code` → `access_token`, **`patient`**, **`fhirUser`** (practitioner).
4. `GET /smart/context` med bearer-token → samma kontext för appen.

Aktivering: automatiskt när `AUTH_MODE=dev`. Stäng av med `SMART_STUB_ENABLED=false`. Tvinga på i keycloak-läge med `SMART_STUB_ENABLED=true` (endast test).

Publik bas-URL för well-known: `FHIR_FACADE_PUBLIC_URL` (default `http://localhost:3003`).

## Svensk profil-stub (MF3)

| Resurs | IG-profil | Runtime |
|--------|-----------|---------|
| Patient | `NimlothStubPatient` (`infra/fhir/ig/input/fsh/NimlothStubPatient.fsh`) | `meta.profile` = `https://fhir.nimloth.local/ig/stub/StructureDefinition/nimloth-stub-patient` |
| Observation | — | **Gap:** ingen FSH-profil i MF3 v1; vitals mappas från openEHR-OBSERVATION med `category=vital-signs` |

Se `infra/fhir/README.md` för SUSHI/CI.

## Medvetet utanför scope (B2)

- Full nationell HL7 SE-IG och IG Publisher i CI
- Produktions-SMART-klientregistrering, refresh tokens, PKCE-hårda krav
- CDS Hooks (→ WP-CDS1)
- Moria/Eldar live-deploy i denna PR

## CI / smoke

- Vitest: `pnpm --filter @nimloth-core/fhir-facade test` (inkl. `smart-launch.test.ts`, `cdr-openehr-read.test.ts`)
- Workflow: `.github/workflows/fhir-facade-smoke.yml` på PR som rör fhir-facade
- Lokalt bevis (stack uppe): `scripts/fhir-wp-fhir1-smoke.sh`

Live E2E mot docker-compose: `E2E_LIVE=1 pnpm --filter @nimloth-core/fhir-facade test` (`dual-store-e2e.test.ts`).
