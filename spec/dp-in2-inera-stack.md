# DP-IN2 — Inera-stack MVP (snäv)

Status: **pågår** (2026-10-01). Dataklass 0, syntetisk testdata.

## Scope (IN)

1. Keycloak JWT-validering i `fhir-facade` för `AUTH_MODE=keycloak|siths`.
2. `AUTH_MODE=dev` oförändrat (X-User-HSA, Bearer-as-HSA, anonym i icke-prod).
3. `PDL_ENFORCE=true` — 403 utan vårdrelation, emergency loggas i audit (befintliga + nya tester).
4. Minimal HSA-stub `services/hsa/` (port **11105**, kontrakt nedan).
5. CI-tester för auth/PDL-matris utan riktig Inera eller prod-hemligheter.

## Explicit OUT

- NPÖ, Pascal, riktig Inera-avtal, produktions-SITHS-CA.
- Full ABAC-policyspråk, delad PDL-microservice (flytt av `pdl.ts`).
- Moria/Eldar live-deploy (valfritt compose-not i root `docker-compose.yml`).

## AUTH_MODE-matris

| AUTH_MODE | Utan cred | X-User-HSA | Bearer (dev) | Giltig JWT |
|-----------|-----------|------------|--------------|------------|
| `dev` | anonym OK (icke-prod) | 200 | HSA = token | HSA = token |
| `keycloak` / `siths` | **401** | ignoreras | **401** (ej JWT) | **200** + PDL enligt headers |

`AUTH_MODE=siths`: samma JWT-kedja som `keycloak`; klientcert/mTLS hanteras vid gateway i framtida sprint, inte i denna PR.

## Miljövariabler (fhir-facade)

| Variabel | Default | Beskrivning |
|----------|---------|-------------|
| `AUTH_MODE` | `dev` | `dev` \| `keycloak` \| `siths` |
| `KEYCLOAK_ISSUER` | se `auth/config.ts` | Realm issuer (JWKS under `/protocol/openid-connect/certs`) |
| `KEYCLOAK_AUDIENCE` | — | Valfri `aud`/`azp`-krav |
| `AUTH_HSA_CLAIM` | `hsa_id` | JWT-claim för HSA-id |
| `HSA_SERVICE_URL` | — | Om satt: POST `/validate` efter JWT |
| `PDL_ENFORCE` | `false` | `true` → 403 vid saknad vårdrelation/spärr |

## HSA-stub (port 11105)

| Endpoint | Beskrivning |
|----------|-------------|
| `GET /health` | Status + antal poster |
| `GET /person/:hsaId` | Syntetisk person |
| `GET /unit/:hsaId` | Syntetisk enhet |
| `GET /person/:hsaId/roles` | Rollista |
| `POST /validate` | `{ "hsaId": "..." }` → `{ valid, person? }` |

Katalog: `services/hsa/data/hsa-catalog.json` (samma HSA-id som Fru Andersson-scenariot).

## Lokal smoke (Keycloak, valfritt)

```bash
docker compose up -d keycloak
pnpm --filter @nimloth-core/hsa dev
# Sätt AUTH_MODE=keycloak, KEYCLOAK_ISSUER=http://localhost:8180/realms/nimloth-core
# Skapa realm + client + user attribute hsa_id → token via Keycloak admin UI eller kcadm.
pnpm --filter @nimloth-core/fhir-facade dev
```

Se `infra/keycloak/README.md` för realm-minimum.

## Referens

- Block 1 Fas 0: `nimloth-docs/Block1_Inera/NOW_Block1_Inera_Fas0.md` §4 MVP-ordning.
