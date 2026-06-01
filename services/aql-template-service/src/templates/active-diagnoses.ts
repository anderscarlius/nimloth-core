import type { TemplateDefinition } from "../types.js";

// Fas 3 AC5 — lista en patients diagnoser (problem_diagnosis.v1).
// data-query, honest. Ger genomgången klinisk kontext (varför står patienten
// på dessa läkemedel — t.ex. warfarin för I48 förmaksflimmer).
//
// KU Steg 1 (2026-06-01) — lineage-utökning:
//   + composition_uid (c/uid/value)
//   + diagnosis_date  (c/context/start_time/value — problem_diagnosis.v1 har
//                      ingen arketyp-intern start-path som är reliable; vi
//                      använder composition-tidpunkten konsekvent)

export const ACTIVE_DIAGNOSES: TemplateDefinition = {
  id: "se.nimloth.aql.active_diagnoses",
  version: "1.1.0",
  title: "Diagnoser för en patient",
  description:
    "Listar problem_diagnosis-compositions (ICD-kod + namn + composition-UID + diagnos-datum) för en patient. Ger klinisk kontext till läkemedelslistan med spårbarhet till källkomposition.",
  parameters: [
    { name: "patient_id", type: "string", required: true, description: "Patientens subject-id i NIMLOTH-namespace." },
  ],
  output: {
    columns: [
      { name: "name", type: "string", description: "Diagnosnamn/beskrivning." },
      { name: "icd", type: "string", description: "ICD-10-kod (eller profil-tagg för icke-normaliserade profiler)." },
      { name: "composition_uid", type: "string", description: "EHRbase composition-UID (lineage)." },
      { name: "diagnosis_date", type: "DV_DATE_TIME", description: "Composition context.start_time." },
    ],
  },
  metadata: {
    tier: "honest",
    category: "data-query",
    sourceAqlId: "AQL-01",
    intent: "Ge medicineringsgenomgången patientens diagnoser som klinisk kontext med spårbarhet till källkomposition.",
  },
  aql: `SELECT
  v/data[at0001]/items[at0002]/value/value AS name,
  v/data[at0001]/items[at0003]/value/defining_code/code_string AS icd,
  c/uid/value AS composition_uid,
  c/context/start_time/value AS diagnosis_date
FROM EHR e
CONTAINS COMPOSITION c
CONTAINS EVALUATION v[openEHR-EHR-EVALUATION.problem_diagnosis.v1]
WHERE e/ehr_status/subject/external_ref/id/value = :patient_id`,
  postProcess: (rows) =>
    rows.map((raw) => {
      const r = raw as unknown[];
      return {
        name: String(r[0]),
        icd: String(r[1]),
        composition_uid: String(r[2]),
        diagnosis_date: typeof r[3] === "string" && r[3] ? String(r[3]) : null,
      };
    }),
};
