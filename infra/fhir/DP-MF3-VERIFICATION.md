# DP-MF3 — Verifikation av grön/röd beteende

Modellfabrikens **tekniska CI för FHIR IG stub (SUSHI-only v1)**.

**Processgräns:** klinisk/semantisk IG-design sker i
[Verkstaden](https://github.com/anderscarlius/vgr-datahubb-verkstad); detta workflow
validerar att committad FSH kompilerar och att ogiltig FSH avvisas.

**Out of scope här:** openEHR MF1/MF2, OPT→FSH, Moria-deploy, full HL7 IG Publisher i CI,
runtime `fhir-facade` (se `fhir-facade-publish.yml`).

## Workflow

`.github/workflows/fhir-ig.yml` — separat från openEHR-workflows (Q1).

## Grön väg

| Steg | Vad som händer |
|------|----------------|
| `sushi` i `infra/fhir/ig/` | FSH kompilerar utan fel |
| Output | Minst en `StructureDefinition-*.json` inkl. profilen `nimloth-stub-patient` |
| Script | `scripts/verify-sushi-green.sh` assertar ovan |

## Röd väg — ogiltig FSH

`scripts/verify-sushi-fail-case.sh` kör SUSHI i temp-IG med `ig/test-fixtures/broken-syntax.fsh`.
Om SUSHI **lyckas** failar jobbet (regression: CI skulle inte fånga trasig FSH).

Ogiltig FSH i `ig/input/fsh/` på en PR ger också röd CI via huvudsteget.

## Acceptanskriterier (core PR)

| ID | Status | Evidens |
|----|--------|---------|
| A1 | PR triggar vid `infra/fhir/**` + workflow-fil | `fhir-ig.yml` `on.pull_request.paths` |
| A2 | SUSHI grön; StructureDefinition från minimal profil | `NimlothStubPatient.fsh` + `verify-sushi-green.sh` |
| A3 | Fail-case röd om SUSHI accepterar ogiltig FSH | `verify-sushi-fail-case.sh` + `broken-syntax.fsh` |
| A4 | Publisher-minimum dokumenterat; ingen full Publisher i CI v1 | `README.md` § IG Publisher |
| A5 | Inventering fhir-facade vs fhir-ig workflows | `README.md` § Inventering |

A6 (docs-status efter merge) hanteras separat i `nimloth-docs`.

## CI-länkar

Efter push: GitHub Actions → workflow **FHIR IG — Modellfabriken (DP-MF3)** på PR.
