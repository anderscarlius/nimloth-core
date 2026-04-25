# Prompt P5 — Inera-stacken (HSA, SITHS, PDL, Sambi, NPÖ, Pascal)


## Kontext

Keycloak körs men är inte wire:ad (ärvt från Nimloth Flow). PDL är middleware i FHIR Facade, X-headers som fake-auth. Ingen kontaktyta mot Inera.

## Mål

Strukturellt stöd för Inera-stacken som mocks, med samma kontrakt som riktiga. PDL lyfts ut till microservice. Keycloak wire:as för OIDC + SITHS.

## Leverans

- `services/hsa/`, `services/pdl/`, `services/npo-client/`, `services/pascal-client/` (alla `@nimloth-core/*`)
- Test-CA + 5 testcertifikat för SITHS
- Keycloak-konfig (realm + clients)
- FHIR Facade: client-cert + JWT + PDL-anrop

## Steg

1. **HSA-tjänst** (port 3011):
   - Testdata i `services/hsa/data/hsa-catalog.json`
   - Endpoints: `GET /person/:hsaId`, `GET /unit/:hsaId`, `GET /person/:hsaId/roles`, `POST /validate`
2. **SITHS-testcert**:
   - `infra/siths/generate-test-ca.sh` genererar CA + 5 client-certs
   - `infra/siths/certs/` (gitignored utom test-CA public)
3. **Keycloak**:
   - Realm `nimloth-core`
   - Client `nimloth-core-api` (confidential, bearer-only)
   - Client `nimloth-core-dashboard` (public, OIDC flow)
   - IdP Broker mot mockad Sambi
   - X.509 cert subject → `hsaId`-claim
4. **PDL-tjänst** (port 3012):
   - `POST /decide`:
     ```typescript
     interface PdlInput {
       user: { hsaId: string; role: string };
       patient: { pnr: string };
       careUnit: string;
       purpose: 'CARE' | 'EMERGENCY' | 'RESEARCH';
       action: 'READ' | 'WRITE';
     }
     ```
   - Konsulterar HSA + mock spärr-register + mock samtyckes-register
   - Beslut + audit till `core.audit.access`
5. **FHIR Facade middleware**:
   ```
   request → siths-cert → jwt → pdl → route
   ```
   `AUTH_MODE=dev` (alla mocks) | `AUTH_MODE=siths` (verklig cert-validering)
6. **NPÖ-client** (port 3013):
   - Periodisk poll mot mockad NPÖ
   - Materialiseras med `source_instance='npö'`
   - UI-badge "NPÖ"
7. **Pascal-client** (port 3014):
   - Samma mönster för läkemedelsförteckning
8. **Dashboard**:
   - Login-flöde via Keycloak
   - Logga ut-knapp
   - HSA-ID + vårdenhet i topp
   - "Byt vårdkontext"-modal

## Acceptans

- `AUTH_MODE=dev`: demo oförändrat.
- `AUTH_MODE=siths`: `curl --cert certs/dr-lindqvist.pem ...` returnerar Fru Andersson.
- Utan cert: 401. Med cert utan vårdrelation: 403 "NO_CARE_RELATION".
- Dashboard login-flöde fungerar.
- `curl http://localhost:3012/decide` returnerar strukturerat PDL-beslut.
- NPÖ-badge syns.

## Tekniska noteringar

- SITHS-cert självsignerade. Produktion = Inera's CA.
- Keycloak-realm export/import via JSON.
- NPÖ-mock: `infra/mocks/npo-mock/` Express-server.
- **PDL-tjänsten ska paketeras som library** för care-unit-edge. `packages/pdl-core/` + tunn REST-wrapper i `services/pdl/`.
- `AUTH_MODE` på Facade + alla edge-runtimes.

**Dependencies:** inga hårda. Behövs av P2 för full offline-PDL.

---

