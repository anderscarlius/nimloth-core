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

## Processgräns: Verkstaden ↔ Nimloth Core (DP-MF1)

**Modellfabrikens Nivå 1** etablerar en tydlig processgräns mellan mänsklig och teknisk kvalitetssäkring:

- **Mänsklig process (Verkstaden):** Arketypdesign, klinisk validering, semantisk korrekthet, terminologibindningar. Sker i [VGR Datahubb Verkstad](https://github.com/anderscarlius/vgr-datahubb-verkstad).

- **Teknisk CI (Nimloth Core):** ADL-syntax, RM-konformitet, OPT-generering, strukturella invarianter. Automatiserad validering via `.github/workflows/openehr-ci-level1.yml`.

Workflow:
1. Arketyper designas och valideras i Verkstaden
2. Färdiga ADL-filer checkas in i `archetypes/`
3. PR-gate (CI Nivå 1) validerar teknisk korrekthet automatiskt
4. Efter merge regenereras OPT och deployeras till runtime

## Roadmap

- **Nivå 1 (NU — P3.0/MF1):** Batch compiler + PR-gate för ADL-validering
- **Nivå 2 (P3.5/MF2):** Runtime compiler-tjänst med REST-API + EHRbase round-trip
- **Nivå 3 (P3.6/MF3):** Dashboard ADL-editor med live preview + FHIR SUSHI
- **Nivå 4 (P3.7+, valfri):** JS-native compiler

Se `compiler/README.md` för byggdetaljer.
