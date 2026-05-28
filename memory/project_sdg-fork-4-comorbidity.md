---
name: sdg-fork-4-comorbidity
description: Fork-4 work — replace aldre_multisjuk profile-tag hack in AQL-11 with real comorbidity modeling.
metadata:
  type: project
---

**AQL-11 (Äldre multisjuka) uses a proxy** that should be lifted in a future Fork-4 phase.

Current proxy (post-SDG-10): patients whose `problem_diagnosis.v1` composition has `diagnosis_code` matching `aldre_multisjuk`. But `aldre_multisjuk` is the SDG *profile name*, not a real diagnosis code — the engine writes the profile tag into the diagnosis-code field. AQL-11 is therefore SDG-internal and is `tier: "proxy"` in [aql_queries.ts](services/data-generator/src/queries/aql_queries.ts).

**Honest fix scope for Fork 4:**
- Multi-diagnosis comorbidity modeling: an aldre_multisjuk patient should carry multiple real ICD diagnoses (E11 diabetes + I10 hypertoni + N18 CKD + …) as separate `problem_diagnosis.v1` compositions.
- AQL-11 then becomes a count-query: "patients with ≥ N distinct ICD-coded diagnoses". No profile-tag dependency.
- Promote AQL-11 from `tier: "proxy"` to `tier: "honest"` after that lands so Fas 2 can register it.

**Why this stays proxy through SDG-10:** changing pathway-logic to emit comorbidities was out of scope (S2). The proxy is acceptable for SDG demos because AQL-11 returns the right *patients* — just for the wrong technical reason. Fas 2's AQL-mall-tjänst MUST NOT register this query as a public Compose template until Fork 4 is in.

**Befordringsgräns (SDG-10 cutoff):** queries 03/05/08/09/11/12 are `tier: "proxy"` and SDG-internal. 01/02/04/06/07/10/13/14/15 are `tier: "honest"` and Fas 2-promotable. The `AqlSpec.tier` field gates this — Fas 2 must filter on `tier === "honest"`.

Related: [[sdg-10-amendments]].
