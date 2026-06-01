import type { TemplateDefinition } from "../types.js";

// Datakontraktets worked example — AQL-07 lyft och GENERALISERAD (D1, Fas 2).
// Returnerar valfri analyt-trend för en patient inom ett datumfönster.
// Default-analyt HBA1C, men mallen + komponenten är analyt-generiska — cashar
// in Fas 1:s fria-unit-design (DV_QUANTITY utan unit-pinning).
//
// INVARIANT 2: CONTAINS OBSERVATION o[archetype_id] — inte FLAT-prefix.
// INVARIANT 1: en composition per mätning, c/context/start_time per rad.
//
// KU Steg 2 (2026-06-01) — lineage-utökning:
//   + composition_uid (c/uid/value) → EHDS data provenance per mätning.
// Bakåtkompatibilitet: timestamp/analyte/magnitude/unit returneras i samma
// form i samma ordning. Befintliga konsumenter (trend-komponent, dashboard)
// kan ignorera composition_uid.

export const OBSERVATION_TREND_BY_PERIOD: TemplateDefinition = {
  id: "se.nimloth.aql.observation_trend_by_period",
  version: "1.1.0",
  title: "Mätvärdestrend för en patient och analyt inom ett datumfönster",
  description:
    "Returnerar samtliga mätningar av en angiven analyt för en patient mellan från-datum och till-datum, sorterat kronologiskt. Värde + enhet kommer från DV_QUANTITY direkt — ingen annotation-parsning. Analyt-generisk: HbA1c i demon, men samma mall driver kreatinin, TSH, etc.",
  parameters: [
    {
      name: "patient_id",
      type: "string",
      required: true,
      description: "Patientens subject-id i NIMLOTH-namespace (t.ex. 'lars-johansson-syn-001').",
    },
    {
      name: "analyte",
      type: "string",
      required: false,
      default: "HBA1C",
      description: "Analyt-namn som matchar analyte_name i lab-compositionen. Default 'HBA1C'.",
    },
    {
      name: "from_date",
      type: "date",
      required: false,
      default: "1900-01-01",
      description: "ISO-datum, inklusivt. Default = '1900-01-01' (= alla tidigare).",
    },
    {
      name: "to_date",
      type: "date",
      required: false,
      default: "2099-12-31",
      description: "ISO-datum, inklusivt. Default = '2099-12-31' (= alla framtida).",
    },
  ],
  output: {
    columns: [
      { name: "timestamp", type: "DV_DATE_TIME", description: "context/start_time för composition." },
      { name: "analyte", type: "string", description: "Analyt-namn (ekar parametern)." },
      { name: "magnitude", type: "Real", description: "Mätvärde." },
      { name: "unit", type: "string", description: "Värdets enhet (t.ex. mmol/mol)." },
      { name: "composition_uid", type: "string", description: "EHRbase composition-UID (lineage)." },
    ],
  },
  metadata: {
    tier: "honest",
    category: "data-query",
    sourceAqlId: "AQL-07",
    intent: "Visualisera mätvärdestrend i journalvyn — agent och kliniker delar samma underlag.",
  },
  aql: `SELECT
  c/context/start_time/value AS timestamp,
  o/data[at0001]/events[at0002]/data[at0003]/items[at0004]/value/value AS analyte,
  o/data[at0001]/events[at0002]/data[at0003]/items[at0006]/value/magnitude AS magnitude,
  o/data[at0001]/events[at0002]/data[at0003]/items[at0006]/value/units AS unit,
  c/uid/value AS composition_uid
FROM EHR e
CONTAINS COMPOSITION c
CONTAINS OBSERVATION o[openEHR-EHR-OBSERVATION.laboratory_test_result.v1]
WHERE e/ehr_status/subject/external_ref/id/value = :patient_id
AND o/data[at0001]/events[at0002]/data[at0003]/items[at0004]/value/value = :analyte
AND c/context/start_time/value >= :from_date
AND c/context/start_time/value <= :to_date
ORDER BY c/context/start_time/value`,
  postProcess: (rows) =>
    rows.map((raw) => {
      const r = raw as unknown[];
      return {
        timestamp: String(r[0]),
        analyte: String(r[1]),
        magnitude: Number(r[2]),
        unit: String(r[3]),
        composition_uid: String(r[4]),
      };
    }),
};
