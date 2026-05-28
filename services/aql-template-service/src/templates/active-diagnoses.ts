import type { TemplateDefinition } from "../types.js";

// Fas 3 AC5 — lista en patients diagnoser (problem_diagnosis.v1).
// data-query, honest. Ger genomgången klinisk kontext (varför står patienten
// på dessa läkemedel — t.ex. warfarin för I48 förmaksflimmer).

export const ACTIVE_DIAGNOSES: TemplateDefinition = {
  id: "se.nimloth.aql.active_diagnoses",
  version: "1.0.0",
  title: "Diagnoser för en patient",
  description:
    "Listar problem_diagnosis-compositions (ICD-kod + namn) för en patient. Ger klinisk kontext till läkemedelslistan.",
  parameters: [
    { name: "patient_id", type: "string", required: true, description: "Patientens subject-id i NIMLOTH-namespace." },
  ],
  output: {
    columns: [
      { name: "name", type: "string", description: "Diagnosnamn/beskrivning." },
      { name: "icd", type: "string", description: "ICD-10-kod (eller profil-tagg för icke-normaliserade profiler)." },
    ],
  },
  metadata: {
    tier: "honest",
    category: "data-query",
    sourceAqlId: "AQL-01",
    intent: "Ge medicineringsgenomgången patientens diagnoser som klinisk kontext.",
  },
  aql: `SELECT
  v/data[at0001]/items[at0002]/value/value AS name,
  v/data[at0001]/items[at0003]/value/defining_code/code_string AS icd
FROM EHR e
CONTAINS COMPOSITION c
CONTAINS EVALUATION v[openEHR-EHR-EVALUATION.problem_diagnosis.v1]
WHERE e/ehr_status/subject/external_ref/id/value = :patient_id`,
  postProcess: (rows) =>
    rows.map((r) => ({ name: String((r as unknown[])[0]), icd: String((r as unknown[])[1]) })),
};
