import type { TemplateDefinition } from "../types.js";

// Fas 3 AC5 — lista en patients dokumenterade allergier/överkänsligheter
// (adverse_reaction_risk.v2). data-query, honest. Underlag för
// kontraindikations-kontroll (penicillinallergi + aktivt penicillin).

export const DOCUMENTED_ALLERGIES: TemplateDefinition = {
  id: "se.nimloth.aql.documented_allergies",
  version: "1.0.0",
  title: "Dokumenterade allergier/överkänsligheter för en patient",
  description:
    "Listar adverse_reaction_risk-compositions (substans + kod + kritikalitet + reaktionstyp) för en patient. Underlag för kontraindikations-kontroll.",
  parameters: [
    { name: "patient_id", type: "string", required: true, description: "Patientens subject-id i NIMLOTH-namespace." },
  ],
  output: {
    columns: [
      { name: "substanceName", type: "string" },
      { name: "substanceCode", type: "string" },
      { name: "criticality", type: "string" },
      { name: "reactionType", type: "string" },
    ],
  },
  metadata: {
    tier: "honest",
    category: "data-query",
    intent: "Ge medicineringsgenomgången patientens dokumenterade allergier.",
  },
  aql: `SELECT
  a/data[at0001]/items[at0002]/value/value AS substance_name,
  a/data[at0001]/items[at0003]/value/defining_code/code_string AS substance_code,
  a/data[at0001]/items[at0004]/value/defining_code/code_string AS criticality,
  a/data[at0001]/items[at0007]/value/defining_code/code_string AS reaction_type
FROM EHR e
CONTAINS COMPOSITION c
CONTAINS EVALUATION a[openEHR-EHR-EVALUATION.adverse_reaction_risk.v2]
WHERE e/ehr_status/subject/external_ref/id/value = :patient_id`,
  postProcess: (rows) =>
    rows.map((r) => ({
      substanceName: String((r as unknown[])[0]),
      substanceCode: String((r as unknown[])[1]),
      criticality: String((r as unknown[])[2]),
      reactionType: String((r as unknown[])[3]),
    })),
};
