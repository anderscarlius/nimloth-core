import { readFileSync, readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "js-yaml";
import seedrandomImport from "seedrandom";
import type { PatientProfile } from "../types/profiles.js";
import { sampleClinical, sampleDemographics } from "./ClinicalSampler.js";
import { loadPathway, runPathway } from "./PathwayEngine.js";
import { assertAnnotation } from "./annotation-contract.js";
import type { PatientContext, PatientTimeline, TimelineEvent } from "./types.js";

/** Expand single medication_statement events into one per probable drug
 *  in profile.common_medications, so polyfarmaci queries find signal.
 *  Drugs are kept if rng() < (med.prob ?? 0.5). */
function expandMedications(
  events: TimelineEvent[],
  profile: PatientProfile,
  rng: () => number,
): TimelineEvent[] {
  const meds = profile.common_medications ?? [];
  if (meds.length === 0) return events;
  const out: TimelineEvent[] = [];
  for (const ev of events) {
    if (ev.eventType !== "medication_statement") {
      out.push(ev);
      continue;
    }
    let emitted = 0;
    for (const med of meds) {
      const prob = med.prob ?? 0.5;
      if (rng() < prob) {
        out.push({
          ...ev,
          clinicalData: {
            ...ev.clinicalData,
            annotation: assertAnnotation(
              `medication_statement | ${med.atc} | ${med.name} ${med.dose ?? ""}`.trim(),
              "medication_statement",
            ),
          },
        });
        emitted++;
      }
    }
    if (emitted === 0) {
      // Always keep at least one so pathway intent isn't lost.
      const med = meds[0];
      out.push({
        ...ev,
        clinicalData: {
          ...ev.clinicalData,
          annotation: assertAnnotation(
            `medication_statement | ${med.atc} | ${med.name} ${med.dose ?? ""}`.trim(),
            "medication_statement",
          ),
        },
      });
    }
  }
  return out;
}

// Fas 3 AC3 — ATC→ICD komorbiditets-härledning (aldre_multisjuk).
//
// Varje emitterad medicin motiverar en äkta ICD-diagnos så polyfarmacin får
// klinisk grund ("warfarin för förmaksflimmer", inte "warfarin för okänd
// anledning") och AQL-11 blir ärlig (räknar äkta ICD, ej profil-taggen).
//
// Dokumenterad mappning (Fas 3 B-beslut):
//   metoprolol→I48 (frekvenskontroll — vald över I10 eftersom warfarin
//   etablerar förmaksflimmer i samma patientbild). amlodipin+ramipril→I10
//   (dedupas till en). warfarin+metoprolol→I48 (dedupas till en).
//   metformin→E11 ärligt (bara patienter som faktiskt bär metformin); Marianne
//   har ingen metformin → ingen diabetes.
interface IcdDerivation {
  icd: string;
  name: string;
}
const ATC_TO_ICD: Record<string, IcdDerivation> = {
  B01AA03: { icd: "I48", name: "Förmaksflimmer" },
  C07AB02: { icd: "I48", name: "Förmaksflimmer (frekvenskontroll)" },
  C10AA05: { icd: "E78", name: "Hyperlipidemi" },
  C08CA01: { icd: "I10", name: "Essentiell hypertoni" },
  C09AA05: { icd: "I10", name: "Essentiell hypertoni" },
  M04AA01: { icd: "M10", name: "Gikt" },
  N06AB06: { icd: "F32", name: "Depressiv episod" },
  C03CA01: { icd: "I50", name: "Hjärtsvikt" },
  A02BC03: { icd: "K21", name: "Gastroesofageal refluxsjukdom" },
  A10BA02: { icd: "E11", name: "Diabetes mellitus typ 2" },
};

// Profiler där komorbiditets-härledning körs. Strikt scope (S5): bara
// aldre_multisjuk ändras; övriga profilers timelines/snapshots orörda.
const COMORBIDITY_PROFILES = new Set(["aldre_multisjuk"]);

/** Härled äkta ICD-komorbiditeter ur patientens emitterade mediciner.
 *  Dedupar per ICD. Metformin-triad: E11-bärare får även en HbA1c-
 *  övervakningslab EFTER diagnosen (en enda punkt) så de inte falskt flaggas
 *  som dropout (E11 + noll HbA1c) — coherent diabetes-triad: diagnos + preparat
 *  + övervakning. Deterministiskt (rng konsumeras sist, per-patient-isolerat). */
function deriveComorbidities(
  events: TimelineEvent[],
  profileId: string,
  rng: () => number,
): TimelineEvent[] {
  if (!COMORBIDITY_PROFILES.has(profileId)) return events;

  const atcs = new Set<string>();
  for (const ev of events) {
    if (ev.eventType !== "medication_statement") continue;
    const code = ev.clinicalData.annotation.split("|")[1]?.trim();
    if (code) atcs.add(code);
  }

  const seenIcd = new Set<string>();
  const extra: TimelineEvent[] = [];
  let hasMetformin = false;
  for (const atc of atcs) {
    const d = ATC_TO_ICD[atc];
    if (!d) continue;
    if (atc === "A10BA02") hasMetformin = true;
    if (seenIcd.has(d.icd)) continue;
    seenIcd.add(d.icd);
    extra.push({
      dayOffset: 0, // baseline-diagnos, etablerad före episoden
      eventType: "problem_diagnosis",
      clinicalData: {
        magnitude: 1,
        realUnit: "1",
        annotation: assertAnnotation(
          `problem_diagnosis | ${d.icd} | ${d.name}`,
          "problem_diagnosis",
        ),
      },
    });
  }

  // Metformin-triad: HbA1c-övervakning EFTER E11-diagnosen (dag 90), behandlat
  // värde 48-58 mmol/mol, EN punkt (ingen trend/responder-kaskad).
  if (hasMetformin) {
    const hba1c = 48 + Math.floor(rng() * 11); // 48-58
    extra.push({
      dayOffset: 90,
      eventType: "lab_result",
      clinicalData: {
        magnitude: hba1c,
        realUnit: "mmol/mol",
        annotation: assertAnnotation(
          `lab_result | HBA1C | ${hba1c} mmol/mol (metformin-övervakning)`,
          "lab_result",
        ),
      },
    });
  }

  return [...events, ...extra];
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, "..", "..");
const PROFILES_DIR = join(PKG_ROOT, "profiles");

export function loadProfile(profileId: string): PatientProfile {
  const file = readdirSync(PROFILES_DIR).find(
    (f) => f.startsWith(`${profileId}.`) || f === `${profileId}.yaml`,
  );
  if (!file) throw new Error(`Profile YAML not found: ${profileId}`);
  return load(readFileSync(join(PROFILES_DIR, file), "utf-8")) as PatientProfile;
}

export interface GeneratorOptions {
  profileId: string;
  count: number;
  seed: number;
  /** Optional fixed patientId prefix; otherwise <profile>-<seed>-<index>. */
  patientIdPrefix?: string;
  /** Optional explicit patient id for a single seed-patient (e.g. Marianne). */
  forcePatientId?: string;
}

export function generateTimelines(opts: GeneratorOptions): PatientTimeline[] {
  const profile = loadProfile(opts.profileId);
  const pathway = loadPathway(profile.care_pathway);
  const timelines: PatientTimeline[] = [];

  for (let i = 0; i < opts.count; i++) {
    const patientSeed = opts.seed + i;
    const rng = seedrandomImport(`${opts.profileId}::${patientSeed}`);

    const patientId =
      opts.count === 1 && opts.forcePatientId
        ? opts.forcePatientId
        : `${opts.patientIdPrefix ?? opts.profileId}-${opts.seed}-${i}`;

    const demographics = sampleDemographics(profile, rng);
    const clinical = sampleClinical(profile, rng);

    const ctx: PatientContext = {
      patientId,
      profileId: opts.profileId,
      seed: patientSeed,
      demographics,
      clinical,
    };

    const rawEvents = runPathway(pathway, ctx, rng);
    const expandedEvents = expandMedications(rawEvents, profile, rng);
    const events = deriveComorbidities(expandedEvents, opts.profileId, rng);
    timelines.push({
      patientId,
      profileId: opts.profileId,
      seed: patientSeed,
      demographics,
      clinical,
      events,
    });
  }

  return timelines;
}
