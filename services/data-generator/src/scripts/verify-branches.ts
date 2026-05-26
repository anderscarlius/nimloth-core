// SDG-09 AC3.5 — verifiera grenfördelning i in-memory generering
// (utan EHRbase-laddning).

import { generateTimelines } from "../engine/TimelineGenerator.js";

// === diabetes_typ2 — räkna per gren ===
// Branch-detektion från events:
//   specialist:    har specialist_consultation
//   dropout:       har problem_diagnosis MEN ingen lab_result EFTER problem_diagnosis
//   responder:     har minst två HBA1C-lab_result där sista magnitude < första
//   nonresponder:  har minst två HBA1C-lab_result där sista magnitude > första
//   standard:      har minst två HBA1C-lab_result där värdena är lika

interface Branch {
  specialist: number;
  dropout: number;
  responder: number;
  nonresponder: number;
  standard: number;
  other: number;
}

function classifyDiabetes(events: Array<{ eventType: string; clinicalData: { annotation: string; magnitude?: number } }>): keyof Branch {
  const hasSpecialist = events.some((e) => e.eventType === "specialist_consultation");
  if (hasSpecialist) return "specialist";

  const diagIdx = events.findIndex((e) => e.eventType === "problem_diagnosis");
  if (diagIdx === -1) return "other";

  const labsAfterDiag = events
    .slice(diagIdx)
    .filter((e) => e.eventType === "lab_result");
  if (labsAfterDiag.length === 0) return "dropout";

  // Hämta initial HBA1C (FÖRE diagnos i pathway-ordningen await_lab → diagnosis)
  const initialLab = events
    .slice(0, diagIdx)
    .reverse()
    .find((e) => e.eventType === "lab_result");
  const followupLab = labsAfterDiag[labsAfterDiag.length - 1];

  if (!initialLab || !followupLab) return "other";
  const a = initialLab.clinicalData.magnitude ?? 0;
  const b = followupLab.clinicalData.magnitude ?? 0;
  if (b < a) return "responder";
  if (b > a) return "nonresponder";
  return "standard";
}

const diabetes = generateTimelines({
  profileId: "diabetes_typ2",
  count: 110,
  seed: 100,
});

const branches: Branch = {
  specialist: 0,
  dropout: 0,
  responder: 0,
  nonresponder: 0,
  standard: 0,
  other: 0,
};
for (const t of diabetes) {
  branches[classifyDiabetes(t.events)]++;
}

console.log("=== diabetes_typ2 (110 patienter, seed=100) ===");
for (const [k, v] of Object.entries(branches)) {
  const pct = ((v / diabetes.length) * 100).toFixed(1);
  console.log(`  ${k.padEnd(13)} ${v.toString().padStart(3)}  (${pct}%)`);
}

// === uvi — räkna patienter med ≥4 primary_care_encounter inom 90 dygn ===
const uvi = generateTimelines({ profileId: "uvi", count: 110, seed: 600 });

function countFreqEncounter(events: Array<{ dayOffset: number; eventType: string }>): number {
  const encs = events
    .filter((e) => e.eventType === "primary_care_encounter")
    .map((e) => e.dayOffset)
    .sort((a, b) => a - b);
  if (encs.length < 4) return encs.length;
  for (let i = 0; i <= encs.length - 4; i++) {
    if (encs[i + 3] - encs[i] <= 90) return encs.length;
  }
  return -1; // ej inom 90-dygnsfönster
}

let uviRecurrent = 0;
const uviHistogram: Record<number, number> = {};
for (const t of uvi) {
  const ct = countFreqEncounter(t.events);
  uviHistogram[ct] = (uviHistogram[ct] ?? 0) + 1;
  if (ct >= 4) uviRecurrent++;
}

console.log("");
console.log("=== uvi (110 patienter, seed=600) ===");
console.log("  Primary_care_encounter-count per patient:");
for (const [k, v] of Object.entries(uviHistogram).sort()) {
  const label = k === "-1" ? "≥4 men ej inom 90d" : `${k}`;
  console.log(`    ${label.padStart(20)}  ${v}`);
}
console.log(`  Triggar AQL-09 (≥4 inom 90d): ${uviRecurrent}`);
