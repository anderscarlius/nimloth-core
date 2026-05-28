import type { TemplateDefinition } from "../types.js";

// AQL-06 lyft. Per-patient check: hade patienten diabetes-diagnos, och i så
// fall — finns det ÖVERHUVUDTAGET en uppföljande HbA1c efter diagnosen?
// dropout = äkta frånvaro (noll HbA1c efter diagnos), INTE "sen uppföljning".
//
// PATCH (Fas 2 Obs 1 de-konflation): tidigare flaggade ett ">N dygn"-villkor
// patienter som HADE uppföljning (Lars dag 123, Eva) som dropout — namnet
// motsade returvärdet. En tier=honest-mall får inte mis-klassificera.
// Fönster-parametern är borttagen: vilken uppföljnings-HbA1c som helst, oavsett
// tidpunkt → on_track. "Sen uppföljning" blir en EGEN mall den dag en
// konsument behöver den.

export const DIABETES_WITHOUT_FOLLOWUP: TemplateDefinition = {
  id: "se.nimloth.aql.diabetes_without_followup",
  version: "2.0.0",
  title: "Diabetes-diagnos utan uppföljande HbA1c",
  description:
    "Per-patient check: hade patienten en diabetes-diagnos? Och i så fall finns det NÅGON uppföljande HbA1c-mätning efter diagnosen? Returnerar exakt en rad: dropout (ingen uppföljning alls), on_track (minst en uppföljning), eller no_diabetes_diagnosis. Inget tidsfönster.",
  parameters: [
    {
      name: "patient_id",
      type: "string",
      required: true,
      description: "Patientens subject-id i NIMLOTH-namespace.",
    },
  ],
  output: {
    columns: [
      { name: "status", type: "string", description: "'dropout' | 'on_track' | 'no_diabetes_diagnosis'" },
      { name: "diagnosis_date", type: "DV_DATE_TIME", description: "Eller null om ingen diagnos." },
      { name: "followup_date", type: "DV_DATE_TIME", description: "Första HbA1c efter diagnos, eller null om dropout." },
    ],
  },
  metadata: {
    tier: "honest",
    category: "quality-measure",
    sourceAqlId: "AQL-06",
    intent: "Beskriver om någon HbA1c-uppföljning skett efter diabetes-diagnos. Deskriptivt tillstånd, ingen åtgärdsrekommendation.",
  },
  aql: `SELECT
  c/archetype_details/template_id/value AS template_id,
  c/context/start_time/value AS timestamp,
  v/data[at0001]/items[at0003]/value/defining_code/code_string AS diag_code,
  o/data[at0001]/events[at0002]/data[at0003]/items[at0004]/value/value AS analyte
FROM EHR e
CONTAINS COMPOSITION c
CONTAINS (EVALUATION v[openEHR-EHR-EVALUATION.problem_diagnosis.v1]
          OR OBSERVATION o[openEHR-EHR-OBSERVATION.laboratory_test_result.v1])
WHERE e/ehr_status/subject/external_ref/id/value = :patient_id
ORDER BY c/context/start_time/value`,
  postProcess: (rows) => {
    let diagDate: string | undefined;
    let firstHba1cAfter: string | undefined;
    for (const r of rows) {
      const tpl = String((r as unknown[])[0]);
      const t = String((r as unknown[])[1]);
      const diagCode = (r as unknown[])[2];
      const analyte = (r as unknown[])[3];
      if (tpl === "problem_diagnosis.v1" && String(diagCode) === "E11" && !diagDate) {
        diagDate = t;
      }
      if (tpl === "laboratory_test_result.v1" && analyte === "HBA1C" && diagDate && t > diagDate && !firstHba1cAfter) {
        firstHba1cAfter = t;
      }
    }
    if (!diagDate) {
      return [{ status: "no_diabetes_diagnosis", diagnosis_date: null, followup_date: null }];
    }
    // dropout ⟺ NOLL HbA1c efter diagnos. Inget tidsfönster.
    if (!firstHba1cAfter) {
      return [{ status: "dropout", diagnosis_date: diagDate, followup_date: null }];
    }
    return [{ status: "on_track", diagnosis_date: diagDate, followup_date: firstHba1cAfter }];
  },
};
