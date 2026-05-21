import type seedrandom from "seedrandom";
import type { PatientProfile, Severity } from "../types/profiles.js";
import type { ClinicalSeed, Demographics } from "./types.js";

const SEVERITY_WEIGHTS: Record<Severity, number> = {
  mild: 0.55,
  moderate: 0.30,
  severe: 0.15,
};

/** Returns the primary lab key per profile — first one whose spec has mild/moderate/severe buckets. */
function primaryLab(profile: PatientProfile): string | null {
  for (const [name, spec] of Object.entries(profile.initial_labs ?? {})) {
    if (spec.mild && spec.moderate && spec.severe) return name;
  }
  return null;
}

function sampleSeverity(rng: seedrandom.PRNG): Severity {
  const r = rng();
  let acc = 0;
  for (const [sev, w] of Object.entries(SEVERITY_WEIGHTS) as [Severity, number][]) {
    acc += w;
    if (r < acc) return sev;
  }
  return "moderate";
}

function uniform(rng: seedrandom.PRNG, range: [number, number]): number {
  return range[0] + rng() * (range[1] - range[0]);
}

function pickFromRange(rng: seedrandom.PRNG, lo: number, hi: number): number {
  return Math.round((lo + rng() * (hi - lo)) * 100) / 100;
}

export function sampleDemographics(
  profile: PatientProfile,
  rng: seedrandom.PRNG,
): Demographics {
  const [ageLo, ageHi] = profile.demographics.age_range;
  const age = Math.round(uniform(rng, [ageLo, ageHi]));
  const sex: Demographics["sex"] =
    rng() < profile.demographics.sex_distribution.female ? "female" : "male";
  const [bmiLo, bmiHi] = profile.demographics.bmi_range ?? [22, 30];
  const bmi = Math.round(uniform(rng, [bmiLo, bmiHi]) * 10) / 10;
  return { age, sex, bmi };
}

export function sampleClinical(
  profile: PatientProfile,
  rng: seedrandom.PRNG,
): ClinicalSeed {
  const severity = sampleSeverity(rng);
  const labs: Record<string, number> = {};

  const primary = primaryLab(profile);
  if (primary) {
    const spec = profile.initial_labs![primary][severity];
    if (spec) labs[primary] = pickFromRange(rng, spec.range[0], spec.range[1]);
  }

  // Sample any flat-range lab values (without severity buckets).
  for (const [name, spec] of Object.entries(profile.initial_labs ?? {})) {
    if (labs[name] !== undefined) continue;
    if (spec.range) labs[name] = pickFromRange(rng, spec.range[0], spec.range[1]);
  }

  // Correlate: if HbA1c severe → glucose tends high; if FEV1 low → saturation low.
  if (severity === "severe") {
    if (labs.hba1c && labs.glucose) labs.glucose = Math.max(labs.glucose, 12.0);
    if (labs.fev1_pct && labs.fev1_pct < 40 && labs.o2_saturation) {
      labs.o2_saturation = Math.min(labs.o2_saturation, 92);
    }
    if (labs.ntprobnp && labs.ejection_fraction) {
      labs.ejection_fraction = Math.min(labs.ejection_fraction, 35);
    }
  }

  return { severity, labs };
}
