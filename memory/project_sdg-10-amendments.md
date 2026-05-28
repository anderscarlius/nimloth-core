---
name: sdg-10-amendments
description: SDG-10 (FAS 1) scope amendments — adverse_reaction deferred to Fas 3, consumer/composer invariants for lab_result.
metadata:
  type: project
---

SDG-10 (FAS 1) migrated SDG composers from fixture-shapes to domain OPTs for lab/medication/diagnosis only.

**Adverse_reaction OUT of SDG-10 scope (decided 2026-05-27, Anders).** Reason: `adverse_reaction` is not an `SdgEventType`. Adding it would require pathway changes (violates S2 in SDG-10). Penicillin allergy stays in `composer.name` annotation on `problem_diagnosis` compositions until Fas 3.

**Fas 3 (medicineringsgenomgång) NEW demo beat:** lift `adverse_reaction` from annotation to real `adverse_reaction_risk.v2` compositions so the medication-review agent reads structured allergies and warns on penicillin prescriptions. The `adverse_reaction_risk.v2` OPT (P3.0d, already bridgade) sits unused-but-ready until then.

**Two invariants encoded in laboratory_test_result.v1 bridge** ([laboratory-test-result-opt.ts](services/openehr-composer/src/bridge/laboratory-test-result-opt.ts)):

1. *Composer invariant* — one measurement per composition; `ctx/time` = sample time. Never multiple `any_event:N` in one composition (collapses `context.start_time` and AQL-10/14 regress to ~0; verified live in SDG-09 Del 1 AC4 "Path B").
2. *Consumer invariant* — discriminate lab compositions by `template_id` (`laboratory_test_result.v1`) or by OBSERVATION archetype, NEVER by composition FLAT-prefix (`event_series` is shared with `time_series.en.v1`).

**Why:** documenting these here so a future agent/Anders doesn't reintroduce Path-B collapse or write AQL that mixes lab results with vital signs.

**How to apply:** when writing AQL for lab data, filter on `CONTAINS OBSERVATION o[openEHR-EHR-OBSERVATION.laboratory_test_result.v1]` or `c/archetype_details/template_id/value = 'laboratory_test_result.v1'`. When extending the composer to batch lab events, refuse to merge them into one composition.

Related: [[sdg-future-terminology]].
