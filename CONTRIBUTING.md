# Bidra till Nimloth Core

Nimloth Core är under aktiv arkitekturell utveckling. Vi följer en sprint-baserad utvecklingsplan.

## Aktuell utveckling

Se `docs/ROADMAP.md` för Sprint 1–5 och `docs/prompts/` för den aktuella arbetsstacken.

## Process

1. Öppna en issue innan du kodar större ändringar
2. PRs märks med sprint-label (`sprint-1`, `sprint-2` osv)
3. Alla PRs måste hålla `./scripts/demo-fru-andersson.sh` grön
4. Uppdatera relevant dokumentation i samma PR
5. Följ existerande kodstil (ESLint-config i repot)

## Om du letar efter en integrationsmotor

Denna repo är en full vårdplattform. Om du bara behöver integrera existerande källsystem till en FHIR-vy — använd systerprodukten [Nimloth Flow](https://github.com/anderscarlius/nimloth-flow) istället.

Se `docs/POSITIONING.md` för mer om val mellan produkterna.
