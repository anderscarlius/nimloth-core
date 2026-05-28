import type { TemplateDefinition } from "../types.js";

// AQL-02 lyft. Returnerar HbA1c-mätningar som överstiger en parametriserad
// tröskel för en patient. Tröskeln är parametriserad per D1 från Fas 1
// (Anders: "server-side MEN parameteriserad — Fas 2-liftbar").

export const HBA1C_ABOVE_THRESHOLD: TemplateDefinition = {
  id: "se.nimloth.aql.hba1c_above_threshold",
  version: "1.0.0",
  title: "HbA1c-mätningar över tröskel för en patient",
  description:
    "Filtrerar HbA1c-mätningar (mmol/mol) över en konfigurerbar tröskel för en angiven patient. Server-side magnitude-filter i AQL.",
  parameters: [
    {
      name: "patient_id",
      type: "string",
      required: true,
      description: "Patientens subject-id i NIMLOTH-namespace.",
    },
    {
      name: "hba1c_threshold",
      type: "number",
      required: false,
      default: 70,
      description: "HbA1c-tröskel i mmol/mol. Default 70 (motsvarar diabetes-mål-överskridande).",
    },
  ],
  output: {
    columns: [
      { name: "timestamp", type: "DV_DATE_TIME" },
      { name: "magnitude", type: "Real" },
      { name: "unit", type: "string" },
    ],
  },
  metadata: {
    tier: "honest",
    category: "data-query",
    sourceAqlId: "AQL-02",
    intent: "Filtrera ut patient-specifika HbA1c-värden över tröskel; tröskeln justeras per klinisk fråga.",
  },
  aql: `SELECT
  c/context/start_time/value AS timestamp,
  o/data[at0001]/events[at0002]/data[at0003]/items[at0006]/value/magnitude AS magnitude,
  o/data[at0001]/events[at0002]/data[at0003]/items[at0006]/value/units AS unit
FROM EHR e
CONTAINS COMPOSITION c
CONTAINS OBSERVATION o[openEHR-EHR-OBSERVATION.laboratory_test_result.v1]
WHERE e/ehr_status/subject/external_ref/id/value = :patient_id
AND o/data[at0001]/events[at0002]/data[at0003]/items[at0004]/value/value = 'HBA1C'
AND o/data[at0001]/events[at0002]/data[at0003]/items[at0006]/value/magnitude > :hba1c_threshold
ORDER BY c/context/start_time/value`,
  postProcess: (rows) =>
    rows.map((r) => ({
      timestamp: String((r as unknown[])[0]),
      magnitude: Number((r as unknown[])[1]),
      unit: String((r as unknown[])[2]),
    })),
};
