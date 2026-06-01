import type { TemplateDefinition } from "../types.js";

// Fas 3 AC5 — lista en patients aktiva mediciner (medication_summary.v1).
// data-query, honest (CONTAINS EVALUATION på arketyp). Konsumeras av
// med-review-orkestratorn som indata till de deterministiska regelmotorerna.
//
// KU Steg 1 (2026-06-01) — lineage-utökning:
//   + composition_uid     (c/uid/value)                         → EHDS data provenance
//   + start_date          (at0006 med fallback till context)    → drug_exposure.start_date
//
// Bakåtkompatibilitet: 'name' och 'atc' bevaras som de första två kolumnerna.
// Befintliga konsumenter (med-review) kan ignorera de nya fälten.
//
// start_date-fallback: medication_summary.v1:s arketyp-interna at0006
// (DV_DATE_TIME "start_date") är ifylld av SDG-09 Del 2 men ej i den bredare
// SDG-genererade populationen. Vi selekterar BÅDA paths och postProcess
// väljer at0006 där den finns, annars c/context/start_time som fallback.

export const ACTIVE_MEDICATIONS: TemplateDefinition = {
  id: "se.nimloth.aql.active_medications",
  version: "1.1.0",
  title: "Aktiva mediciner för en patient",
  description:
    "Listar medication_summary-compositions (läkemedelsnamn + ATC-kod + composition-UID + start-datum) för en patient. Underlag för interaktions-/Beers-STOPP-kontroll OCH lineage-spårning tillbaka till CDR-kompositionen.",
  parameters: [
    { name: "patient_id", type: "string", required: true, description: "Patientens subject-id i NIMLOTH-namespace." },
  ],
  output: {
    columns: [
      { name: "name", type: "string", description: "Läkemedelsnamn." },
      { name: "atc", type: "string", description: "ATC-kod." },
      { name: "composition_uid", type: "string", description: "EHRbase composition-UID (lineage)." },
      {
        name: "start_date",
        type: "DV_DATE_TIME",
        description:
          "Medicineringens startdatum (arketyp-intern at0006 om satt, annars composition context.start_time som fallback).",
      },
    ],
  },
  metadata: {
    tier: "honest",
    category: "data-query",
    sourceAqlId: "AQL-04",
    intent: "Ge medicineringsgenomgången patientens aktiva läkemedelslista med spårbarhet till källkomposition.",
  },
  aql: `SELECT
  m/data[at0001]/items[at0002]/value/value AS name,
  m/data[at0001]/items[at0003]/value/defining_code/code_string AS atc,
  c/uid/value AS composition_uid,
  m/data[at0001]/items[at0006]/value/value AS archetype_start_date,
  c/context/start_time/value AS context_start_time
FROM EHR e
CONTAINS COMPOSITION c
CONTAINS EVALUATION m[openEHR-EHR-EVALUATION.medication_summary.v1]
WHERE e/ehr_status/subject/external_ref/id/value = :patient_id`,
  postProcess: (rows) =>
    rows.map((raw) => {
      const r = raw as unknown[];
      const archetypeStart = r[3];
      const contextStart = r[4];
      // Prefer arketyp-intern at0006; fallback till composition.context.start_time.
      const start_date =
        typeof archetypeStart === "string" && archetypeStart.length > 0
          ? archetypeStart
          : typeof contextStart === "string" && contextStart.length > 0
            ? contextStart
            : null;
      return {
        name: String(r[0]),
        atc: String(r[1]),
        composition_uid: String(r[2]),
        start_date,
      };
    }),
};
