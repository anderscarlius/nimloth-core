import type { TemplateDefinition } from "../types.js";

// AQL-14 lyft. Spegelbild av responder-mallen: sista HbA1c > första, med
// medication_summary mellan. Visar utebliven respons.

export const NONRESPONDER_AFTER_RX: TemplateDefinition = {
  id: "se.nimloth.aql.nonresponder_after_rx",
  version: "1.0.0",
  title: "HbA1c-försämring trots läkemedelsinsättning",
  description:
    "Returnerar 1 rad om patienten är non-responder: sista HbA1c > första HbA1c, med minst en medication_summary mellan mätningarna. Annars tom.",
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
      { name: "first_lab_date", type: "DV_DATE_TIME" },
      { name: "first_lab_magnitude", type: "Real" },
      { name: "last_lab_date", type: "DV_DATE_TIME" },
      { name: "last_lab_magnitude", type: "Real" },
      { name: "rx_at", type: "DV_DATE_TIME" },
      { name: "delta", type: "Real" },
    ],
  },
  metadata: {
    tier: "honest",
    category: "quality-measure",
    sourceAqlId: "AQL-14",
    intent: "Beskriver om HbA1c steg trots läkemedelsinsättning (non-responder-tillstånd). Deskriptivt, ingen åtgärdsrekommendation.",
  },
  aql: `SELECT
  c/archetype_details/template_id/value AS template_id,
  c/context/start_time/value AS timestamp,
  o/data[at0001]/events[at0002]/data[at0003]/items[at0004]/value/value AS analyte,
  o/data[at0001]/events[at0002]/data[at0003]/items[at0006]/value/magnitude AS magnitude
FROM EHR e
CONTAINS COMPOSITION c
CONTAINS (OBSERVATION o[openEHR-EHR-OBSERVATION.laboratory_test_result.v1]
          OR EVALUATION m[openEHR-EHR-EVALUATION.medication_summary.v1])
WHERE e/ehr_status/subject/external_ref/id/value = :patient_id
ORDER BY c/context/start_time/value`,
  postProcess: (rows) => {
    let firstLab: { date: string; val: number } | undefined;
    let lastLab: { date: string; val: number } | undefined;
    let rxAfterFirst: string | undefined;
    for (const r of rows) {
      const tpl = String((r as unknown[])[0]);
      const date = String((r as unknown[])[1]);
      const analyte = (r as unknown[])[2];
      const magnitude = (r as unknown[])[3];
      if (tpl === "laboratory_test_result.v1" && analyte === "HBA1C") {
        const val = Number(magnitude);
        if (!Number.isFinite(val)) continue;
        if (!firstLab) firstLab = { date, val };
        lastLab = { date, val };
      } else if (tpl === "medication_summary.v1" && firstLab && !rxAfterFirst) {
        if (date >= firstLab.date) rxAfterFirst = date;
      }
    }
    if (!firstLab || !lastLab || !rxAfterFirst || lastLab.val <= firstLab.val) return [];
    return [
      {
        first_lab_date: firstLab.date,
        first_lab_magnitude: firstLab.val,
        last_lab_date: lastLab.date,
        last_lab_magnitude: lastLab.val,
        rx_at: rxAfterFirst,
        delta: Math.round((lastLab.val - firstLab.val) * 10) / 10,
      },
    ];
  },
};
