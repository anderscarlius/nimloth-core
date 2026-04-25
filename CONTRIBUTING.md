# Bidra till Nimloth Core

Nimloth Core är en stabiliserad integrationsmotor. Scopet är medvetet begränsat.

## Välkomna bidrag

- Bug-fixar
- Säkerhetspatchar
- Stabilitetsförbättringar
- Dokumentationsförbättringar
- Nya källsystem-anslutningar (följ `docs/EXTENDING.md`)
- Minor UX-förbättringar i dashboard

## Avvisade bidrag (gå till Nimloth Core istället)

- openEHR-integration eller annan kanonisk klinisk modell
- Lakehouse- eller analytiska arkitekturlager
- Modulär Inera-stack (SITHS, HSA, Sambi-federation)
- AI-assisterad mappning
- CQL- eller annan regelbaserad CDS-motor
- Ny clinical data lifecycle-funktionalitet

För plattforms-arkitektur, se systerprodukten [Nimloth Core](https://github.com/anderscarlius/nimloth-core).

## Process

1. Öppna en issue innan du kodar en större ändring
2. Följ existerande kodstil (ESLint-config i repot)
3. Alla PRs måste hålla `./scripts/demo-fru-andersson.sh` grön
4. Uppdatera relevant dokumentation i samma PR
