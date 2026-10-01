# Keycloak — lokal dev (DP-IN2)

Root `docker-compose.yml` startar Keycloak 24 i `start-dev` på host-port **8180** (container 8080).

## Minimum för fhir-facade JWT

1. Skapa realm `nimloth-core`.
2. Skapa confidential/bearer-only client `nimloth-fhir` (audience om `KEYCLOAK_AUDIENCE` sätts).
3. Lägg user attribute `hsa_id` på testanvändare (syntetiskt, t.ex. `SE123456789`).
4. Protocol mapper: user attribute `hsa_id` → token claim `hsa_id`.
5. `KEYCLOAK_ISSUER=http://localhost:8180/realms/nimloth-core`

Inga produktionshemligheter eller riktig SITHS-CA i git. Admin `admin`/`admin` endast för lokal dev.

Valfri import: lägg en realm-export i denna katalog och mounta till `/opt/keycloak/data/import/` med `start-dev --import-realm` (manuell justering per miljö).
