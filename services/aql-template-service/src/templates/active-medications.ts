import type { TemplateDefinition } from "../types.js";

// Fas 3 AC5 — lista en patients aktiva mediciner (medication_summary.v1).
// data-query, honest (CONTAINS EVALUATION på arketyp). Konsumeras av
// med-review-orkestratorn som indata till de deterministiska regelmotorerna.

export const ACTIVE_MEDICATIONS: TemplateDefinition = {
  id: "se.nimloth.aql.active_medications",
  version: "1.0.0",
  title: "Aktiva mediciner för en patient",
  description:
    "Listar medication_summary-compositions (läkemedelsnamn + ATC-kod) för en patient. Underlag för interaktions-/Beers-STOPP-kontroll.",
  parameters: [
    { name: "patient_id", type: "string", required: true, description: "Patientens subject-id i NIMLOTH-namespace." },
  ],
  output: {
    columns: [
      { name: "name", type: "string", description: "Läkemedelsnamn." },
      { name: "atc", type: "string", description: "ATC-kod." },
    ],
  },
  metadata: {
    tier: "honest",
    category: "data-query",
    sourceAqlId: "AQL-04",
    intent: "Ge medicineringsgenomgången patientens aktiva läkemedelslista.",
  },
  aql: `SELECT
  m/data[at0001]/items[at0002]/value/value AS name,
  m/data[at0001]/items[at0003]/value/defining_code/code_string AS atc
FROM EHR e
CONTAINS COMPOSITION c
CONTAINS EVALUATION m[openEHR-EHR-EVALUATION.medication_summary.v1]
WHERE e/ehr_status/subject/external_ref/id/value = :patient_id`,
  postProcess: (rows) =>
    rows.map((r) => ({ name: String((r as unknown[])[0]), atc: String((r as unknown[])[1]) })),
};
