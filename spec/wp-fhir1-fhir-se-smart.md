# WP-FHIR1 — FHIR SE + SMART stub (Fas B2)

Status: **implementerad** i `fhir-facade`. Runtime-dokumentation: `services/fhir-facade/docs/WP-FHIR1-FHIR-SE-SMART.md`.

## Acceptans (Plan_Bygg B2)

| # | Krav | Status |
|---|------|--------|
| 1 | Patient + Observation (vitals) via FHIR mot CDR (`CANONICAL_STORE=openehr`) | ✅ AQL-väg + tester |
| 2 | Svensk profil-stub från `infra/fhir/ig` | ✅ Patient `meta.profile`; Observation dokumenterat gap |
| 3 | SMART launch (dev) med patient + practitioner context | ✅ `/smart/*` stub |
| 4 | CI-smoke | ✅ `fhir-facade-smoke.yml` + Vitest |
| 5 | Docs FHIR transport / openEHR persistens | ✅ WP-FHIR1-doc |

## Förutsättningar

- MF3 IG stub ✅
- DEMO1 (demo-fru-andersson.sh) ✅ — FHIR-steg 1+; vitals via `Observation?patient=…&category=vital-signs` med `CANONICAL_STORE=openehr`
