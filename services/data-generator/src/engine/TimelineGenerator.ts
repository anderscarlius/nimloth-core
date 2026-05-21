import { readFileSync, readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "js-yaml";
import seedrandomImport from "seedrandom";
import type { PatientProfile } from "../types/profiles.js";
import { sampleClinical, sampleDemographics } from "./ClinicalSampler.js";
import { loadPathway, runPathway } from "./PathwayEngine.js";
import type { PatientContext, PatientTimeline } from "./types.js";

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

    const events = runPathway(pathway, ctx, rng);
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
