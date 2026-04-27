# openEHR i Nimloth Core

Detta är öppningen till Nimloth Cores openEHR-spår. Den följer en fyra-nivåers
roadmap där den här mappen rymmer Nivå 1 (batch compiler) i sin nuvarande form.

## Mappstruktur

- `archetypes/` — ADL 1.4-källkod hämtad från openEHR CKM. Versionshanteras.
- `templates/` — OPT 1.4-output från compilern. Committas men regenereras.
- `test-fixtures/` — Externa referens-OPT för verifiering. Inte runtime-leverabler.
- `compiler/` — Java-baserad ADL→OPT-compiler. Bygger till Docker-image.
- `scripts/` — Hjälpscript som körs från host (load-templates.mjs).

## Pipeline

1. ADL-fil läggs i `archetypes/`
2. `pnpm openehr:compile` triggar Docker-baserad kompilering
3. OPT-output skrivs till `templates/`
4. `pnpm openehr:load-templates` POSTar OPT till EHRbase
5. EHRbase verifierar och accepterar (eller returnerar fel)

## Roadmap

- **Nivå 1 (NU — P3.0):** Batch compiler, manuell trigger
- **Nivå 2 (P3.5):** Runtime compiler-tjänst med REST-API
- **Nivå 3 (P3.6):** Dashboard ADL-editor med live preview
- **Nivå 4 (P3.7+, valfri):** JS-native compiler

Se `compiler/README.md` för byggdetaljer.
