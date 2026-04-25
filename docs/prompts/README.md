# Nimloth Core — utbyggnadsprompter

Sju oberoende Claude Code-prompter som tillsammans bygger ut Nimloth Core från Sprint 0-baseline till Sprint 5-målbild. Varje prompt är självständig (dependencies noterade per prompt) och producerar demobart resultat.

## Sprintplan

| Sprint | Veckor | Prompts | Fokus |
|---|---|---|---|
| 1 | 2 | [P1](P1-terminology.md), [P2](P2-care-unit-edge.md) | Terminologitjänst + Care-unit-edge (vårdcentralsnivå) |
| 2 | 3 | [P3](P3-openehr.md), [P4](P4-mapping-assistant.md) | openEHR parallellt kanoniskt lager + AI-assisterad mappning |
| 3 | 3 | [P5](P5-inera-stack.md) | Inera-stacken (HSA, SITHS, PDL, Sambi, NPÖ, Pascal) |
| 4 | 3 | [P6](P6-lakehouse.md) | Lakehouse (bronze + silver + OMOP gold) |
| 5 | 3 | [P7](P7-cds-cql.md) | CDS-regler: PlanDefinition + CQL-runner POC |

## Hur prompterna används

Varje prompt körs som egen Claude Code-session. Promptformatet följer:

1. **Kontext** — vad som finns idag
2. **Mål** — vad denna prompt levererar
3. **Leverans** — konkreta artefakter (filer, containers, endpoints)
4. **Steg** — numrerad implementationsplan
5. **Acceptans** — verifierbara kriterier
6. **Tekniska noteringar** — fällor, beroenden, alternativ

## Bakåtkompatibilitet

När en prompt är klar ska `./scripts/start.sh` + `./scripts/demo-fru-andersson.sh` fortfarande fungera **utan förändring**. Fru Andersson-scenariot är baseline-test mellan varje sprint.

## Ursprung

Prompterna härstammar från VGR Datahub Prompts v3 (pre-fork). Efter forken (tag `v0.1-pre-fork`) har de uppdaterats för Nimloth Core:s namnrymd (`@nimloth-core/*`, `core.clinical.*`, `core-db` osv.).

Källa: `nimloth-docs/Nimloth_Core_Prompts_v1.md` — bevarad som referens i nimloth-docs-arkivet. Här är de splittade per prompt för enklare hantering.
