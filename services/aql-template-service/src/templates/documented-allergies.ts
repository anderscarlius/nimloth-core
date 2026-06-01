import type { TemplateDefinition } from "../types.js";

// Fas 3 AC5 — lista en patients dokumenterade allergier/överkänsligheter
// (adverse_reaction_risk.v2). data-query, honest. Underlag för
// kontraindikations-kontroll (penicillinallergi + aktivt penicillin).
//
// KU Steg 1 (2026-06-01) — lineage-utökning:
//   + composition_uid (c/uid/value)
//   + recorded_date   (c/context/start_time/value)

export const DOCUMENTED_ALLERGIES: TemplateDefinition = {
  id: "se.nimloth.aql.documented_allergies",
  version: "1.1.0",
  title: "Dokumenterade allergier/överkänsligheter för en patient",
  description:
    "Listar adverse_reaction_risk-compositions (substans + kod + kritikalitet + reaktionstyp + composition-UID + registreringsdatum) för en patient. Underlag för kontraindikations-kontroll med spårbarhet till källkomposition.",
  parameters: [
    { name: "patient_id", type: "string", required: true, description: "Patientens subject-id i NIMLOTH-namespace." },
  ],
  output: {
    columns: [
      { name: "substanceName", type: "string" },
      { name: "substanceCode", type: "string" },
      { name: "criticality", type: "string" },
      { name: "reactionType", type: "string" },
      { name: "composition_uid", type: "string", description: "EHRbase composition-UID (lineage)." },
      { name: "recorded_date", type: "DV_DATE_TIME", description: "Composition context.start_time." },
    ],
  },
  metadata: {
    tier: "honest",
    category: "data-query",
    intent: "Ge medicineringsgenomgången patientens dokumenterade allergier med spårbarhet till källkomposition.",
  },
  aql: `SELECT
  a/data[at0001]/items[at0002]/value/value AS substance_name,
  a/data[at0001]/items[at0003]/value/defining_code/code_string AS substance_code,
  a/data[at0001]/items[at0004]/value/defining_code/code_string AS criticality,
  a/data[at0001]/items[at0007]/value/defining_code/code_string AS reaction_type,
  c/uid/value AS composition_uid,
  c/context/start_time/value AS recorded_date
FROM EHR e
CONTAINS COMPOSITION c
CONTAINS EVALUATION a[openEHR-EHR-EVALUATION.adverse_reaction_risk.v2]
WHERE e/ehr_status/subject/external_ref/id/value = :patient_id`,
  postProcess: (rows) =>
    rows.map((raw) => {
      const r = raw as unknown[];
      return {
        substanceName: String(r[0]),
        substanceCode: String(r[1]),
        criticality: String(r[2]),
        reactionType: String(r[3]),
        composition_uid: String(r[4]),
        recorded_date: typeof r[5] === "string" && r[5] ? String(r[5]) : null,
      };
    }),
};
