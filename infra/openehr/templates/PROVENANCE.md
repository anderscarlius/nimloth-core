# Provenance för templates

Denna mapp innehåller **runtime-leverabler** — XML-OPT-filer som laddas in i EHRbase via `/definition/template/adl1.4`-endpoint. Skiljer sig från `infra/openehr/test-fixtures/`-mappen som har upstream-referens-OPT från ehrbase-integration-tests.

OPT:er här genereras av scripts i `infra/openehr/compiler/scripts/` baserat på antingen ADL-källor (när P3.0b-bridge mognar) eller fixture-pivot (Sprint 2 P3.0-pivot, fortfarande aktivt för Sprint 2.5+).

---

## medication_summary.v1.opt.xml

- **Genererat av:** `infra/openehr/compiler/scripts/build-medication-summary-opt.sh`
- **Källa:** Sed-transform av `infra/openehr/test-fixtures/ehrbase-test-minimal-evaluation.opt` (upstream ehrbase-integration-tests, Apache 2.0)
- **Genereringsdatum:** 2026-05-03
- **SHA256:** `52c2fce655547fe12ef56795f44a879e1b3ed0b86202d2b7ac088bc12c174eb2`
- **Filstorlek:** 253 rader
- **Template-UID:** `8a5e9c3b-7f12-4d6a-9e8f-3c4b1a2d5e6f` (stabilt — ändra inte utan att bumpa template-version)
- **Template-id:** `medication_summary.v1`
- **Archetype-id:** `openEHR-EHR-EVALUATION.medication_summary.v1`
- **Live-verifierat:** 2026-05-03 mot EHRbase 2.30.1 — HTTP 201 vid POST, GET-back returnerar samma archetype_id
- **Användning:** P3.0b Path C — möjliggör `core.clinical.medication.prescribed/.dispensed`-events att flöda till openEHR-vägen. Avblockerar EVALUATION-mappning i composer event-mapper. ParityTrend MedicationStatement öppnas från postgres=2/openehr=0 till matchande counts (väntar Del 2 — composer composition-builder-utvidgning).
- **Licens:** Apache 2.0 (genererat från Apache 2.0-källa via deterministisk transform)
- **Fas-kontext:** P3.0b spec sektion 5 AC2 + AC3. Sprint 2.5 alt 3-bygge.

---

## Reproduktionssteg

```bash
cd nimloth-core
./infra/openehr/compiler/scripts/build-medication-summary-opt.sh
```

Idempotent — samma input ger samma SHA256-output. Verifiera mot förväntad SHA256 ovan.

## Backlog

- **B12-kandidat:** Generisk ADL→OPT-bridge (TS-native). När 3+ EVALUATION-arketyper kräver fixture-pivot (post P3.0c/P3.0d) — bygg generisk lösning. Idag (2026-05-03) bara `medication_summary.v1` använder pattern; kostnad för generisk bridge motiverar inte sig vid N=1.
