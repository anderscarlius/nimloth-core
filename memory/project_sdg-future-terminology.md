---
name: sdg-future-terminology
description: Future SDG/Nimloth phase — bind lab/medication coded fields to real terminology and consider report-result.v1 as lab container.
metadata:
  type: project
---

After SDG-10 / FAS 1 (P3.0e laboratory_test_result bridge), the following are deferred to a later terminology-binding phase:

- `analyte_code` element in `laboratory_test_result.v1`: currently `local`. Bind to NPU + LOINC. Example: HbA1c → NPU03835 / LOINC 26464-8. Requires a composer-side code-list lookup keyed on analyte_name.
- `DV_QUANTITY` units in `laboratory_test_result.v1`: deliberately unconstrained in the OPT. Units are clinically determined per analyte, not template-determined — this stays.
- `atc_code` in `medication_summary.v1` and coded fields in `problem_diagnosis.v1` / `adverse_reaction_risk.v2`: also bound to `local` today (EHRbase ItemValidator NPE workaround). Rebind once a real terminology service is wired.
- Container migration: consider `openEHR-EHR-COMPOSITION.report-result.v1` as the idiomatic lab-report container when terminology layer lands — replaces the current `event_series.v1` choice for lab compositions.

**Why:** SDG-10 chose minimum-viable structural realism over terminology fidelity to unblock Fas 2's AQL-mall-tjänst. Terminology binding is a separate phase with its own demo beats.

**How to apply:** When adding terminology service or planning a future demo around coded lab/medication queries, this is the consolidated TODO list. Cross-reference with the [[sdg-10-amendments]] for adverse_reaction routing (which Fas 3 will lift from annotation to real adverse_reaction_risk.v2 compositions).
