# openEHR i Nimloth Core

Detta är öppningen till Nimloth Cores openEHR-spår. Den följer en fyra-nivåers
roadmap där den här mappen rymmer Nivå 1 (batch compiler) i sin nuvarande form.

## Mappstruktur

- `archetypes/` — ADL 1.4-källkod hämtad från openEHR CKM. Versionshanteras.
- `templates/` — OPT 1.4-output från compilern. Committas men regenereras.
- `test-fixtures/` — Externa referens-OPT för verifiering. Inte runtime-leverabler.
- `compiler/` — Java-baserad ADL→OPT-compiler. Bygger till Docker-image.
- `scripts/` — Hjälpscript som körs från host (load-templates.mjs, path-baseline-check).
- `path-baselines/` — Committade RM-path-inventarier för MF2 path-diff (se `path-baselines/README.md`).

## Pipeline

1. ADL-fil läggs i `archetypes/`
2. `pnpm openehr:compile` triggar Docker-baserad kompilering
3. OPT-output skrivs till `templates/`
4. `pnpm openehr:load-templates` POSTar OPT till EHRbase
5. EHRbase verifierar och accepterar (eller returnerar fel)

## Processgräns: Verkstaden ↔ Nimloth Core (DP-MF1 / DP-MF2)

**Modellfabriken** delar ansvar mellan mänsklig och teknisk kvalitetssäkring:

- **Mänsklig process (Verkstaden):** Arketypdesign, klinisk validering, semantisk korrekthet, terminologibindningar. Sker i [VGR Datahubb Verkstad](https://github.com/anderscarlius/vgr-datahubb-verkstad).

- **Teknisk CI nivå 1 (Nimloth Core):** ADL-syntax, RM-konformitet, OPT-generering, strukturella invarianter. `.github/workflows/openehr-ci-level1.yml`.

- **Teknisk CI nivå 2 (Nimloth Core, DP-MF2):** EHRbase round-trip (POST/GET compiler-OPT), AQL-smoke mot syntetisk composition (dataclass 0), path-diff mot `path-baselines/`. `.github/workflows/openehr-ci-level2.yml`. Verifieringsmatris: `DP-MF2-VERIFICATION.md`.

Workflow:
1. Arketyper designas och valideras i Verkstaden
2. Färdiga ADL-filer checkas in i `archetypes/`
3. PR-gate MF1 validerar compile; PR-gate MF2 validerar EHRbase-kontrakt (separata workflows)
4. Efter merge regenereras OPT; runtime-deploy sker utanför detta repo (ingen Moria i MF2)

**Out of scope i MF2:** FHIR SUSHI/IG (MF3), Moria live-deploy, produktions-CDR.

## Roadmap

- **Nivå 1 (P3.0/MF1 — aktiv):** Batch compiler + PR-gate för ADL-validering
- **Nivå 2 (P3.5/MF2 — aktiv):** EHRbase round-trip + AQL + path-diff i CI (runtime compiler-REST = senare)
- **Nivå 3 (P3.6/MF3):** Dashboard ADL-editor + FHIR SUSHI/IG
- **Nivå 4 (P3.7+, valfri):** JS-native compiler

Se `compiler/README.md` för byggdetaljer.
