# WP-IN3 — Samtycke/spärr + OPA (Fas D)

**Status:** implementerat (dataklass 0, syntetisk testdata).  
**Planreferens:** Plan Bygg § D WP-IN3.  
**Förutsättning:** DP-IN2 (Keycloak JWT, HSA-stub, `PDL_ENFORCE`).

## Syfte

Lyfta spärr/samtycke till en explicit stub-tjänst och tillämpa en **OPA-policy**
på en kritisk FHIR/PDL-path (`GET /fhir/r4/Patient/:id`). Nödöppning kräver
motivering som skrivs i audit.

## Acceptans (mappning)

| Krav | Implementation |
|------|----------------|
| 1. Samtycke/spärr-stub (allow/deny) | `services/consent` (:11106) — `GET /blocks/:pnr`, `GET /consent/:pnr`, `POST /decide` mot syntetisk `data/consent-registry.json`. |
| 2. OPA (eller motsv.) på kritisk path | `infra/opa/policies/fhir_patient_read.rego` + runtime `@nimloth-core/pdl-policy` i `fhir-facade` middleware när `PDL_OPA_PATIENT_READ=true` (default på när `PDL_ENFORCE=true`). |
| 3. Nödöppning + motivering i audit | Header `X-PDL-Emergency-Justification` obligatorisk vid enforce; audit `details.emergency_justification` + `outcome=EMERGENCY_ACCESS`. |
| 4. CI/smoke + spec | `scripts/wp-in3-consent-opa-smoke.sh`, `.github/workflows/ci.yml`, denna fil. |

## Miljövariabler (fhir-facade)

| Variabel | Default | Beskrivning |
|----------|---------|-------------|
| `CONSENT_SERVICE_URL` | — | Om satt: lookup `GET /consent/:pnr?purpose=RESEARCH` före OPA vid forskningssyfte. |
| `PDL_OPA_PATIENT_READ` | `true` när `PDL_ENFORCE=true` | Aktiverar OPA på Patient-read. |
| `PDL_ENFORCE` | `false` | Se DP-IN2. |

## Headers (klinisk demo)

| Header | Syfte |
|--------|--------|
| `X-PDL-Emergency-Access: true` | Nödöppning (PDL 4:1). |
| `X-PDL-Emergency-Justification` | Obligatorisk fri text vid nödöppning (audit). |

## Explicit OUT

- Prod-SITHS, NPÖ, patientdata i git, Eldar/Moria live-deploy.
- Full PDL-microservice (`services/pdl/`) — kvar i Sprint 3/P5 roadmap.

## Avvecklingsväg

När `services/pdl/` landar: behåll Rego-paketet men låt beslutstjänsten köra OPA
(sidecar eller inbäddad WASM) och låt fhir-facade anropa `POST /pdl/decide`
istället för in-process `evaluateFhirPatientRead`.
