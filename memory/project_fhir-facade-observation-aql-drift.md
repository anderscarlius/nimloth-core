---
name: fhir-facade-observation-aql-drift
description: Latent AQL-broker drift in fhir-facade after SDG-10 lab migration — observation.aql reads at0004 which is now analyte_name, not the value.
metadata:
  type: project
---

**Found in Fas 2 PATCH A (grep for fixture-shape dependencies post-SDG-10).**

`services/fhir-facade/src/stores/openehr/templates/observation.aql` reads
`o/data[at0001]/events[at0002]/data[at0003]/items[at0004]/value` generically across
all OBSERVATIONs.

- **Pre-SDG-10**: at0004 = the single Quantity element in `time_series.en.v1` → returned the value. Correct.
- **Post-SDG-10**: for `laboratory_test_result.v1`, at0004 = `analyte_name` (DV_TEXT "HBA1C"), and the magnitude moved to at0006. So this broker query now returns the analyte NAME for lab compositions, not the value. Vital_signs (still time_series fixture) still returns value at at0004 — so it's a MIXED/silent mismatch.

**Why it's not breaking today:**
- Default `CANONICAL_STORE=postgres` (Fas 1 config) — the AQL-broker read path is inactive unless explicitly set to `openehr`.
- `condition.aql` / `medication-statement.aql` are documented Sprint-2 stubs that "returnerar 0 rows" pending P3.0b client-side archetype filtering.

**Why deferred (not fixed in Fas 2):**
- fhir-facade is **Kontrakt 2 (FHIR-mallar)** territory — explicitly OUT OF SCOPE per Fas 2 S2.
- A proper fix re-maps the FHIR Observation projection against the new lab archetype (at0004=name, at0006=value, at0005=code) — its own piece of work.

**How to apply when picking this up:** update `observation.aql` to select per-archetype: for `laboratory_test_result.v1` read at0006 (magnitude) + at0004 (analyte name) + units; keep at0004=value only for `time_series.v1`. Likely needs the multi-CONTAINS-OR pattern (see aql-template-service templates) or template_id discrimination, then client-side AqlToFhir mapping per archetype. This is the FHIR-side mirror of the SDG-10 äkta-path migration.

Related: [[sdg-10-amendments]] (INVARIANT 2 — discriminate on archetype, not FLAT-prefix).
