import { readdirSync, readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "js-yaml";
import type { PatientProfile } from "../types/profiles.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, "..", "..");
const PROFILES_DIR = join(PKG_ROOT, "profiles");

interface ValidationIssue {
  profileId: string;
  severity: "error" | "warning";
  message: string;
}

// Clinical reasonableness checks (per SDG-03 spec).
const CLINICAL_RULES: Array<(p: PatientProfile) => ValidationIssue[]> = [
  (p) => {
    const [lo, hi] = p.demographics.age_range;
    const issues: ValidationIssue[] = [];
    if (!(lo >= 0 && hi <= 110 && lo < hi)) {
      issues.push({ profileId: p.profile_id, severity: "error", message: `Invalid age_range [${lo}, ${hi}]` });
    }
    return issues;
  },
  (p) => {
    const issues: ValidationIssue[] = [];
    const { female, male } = p.demographics.sex_distribution;
    if (Math.abs(female + male - 1) > 0.01) {
      issues.push({
        profileId: p.profile_id,
        severity: "error",
        message: `Sex distribution must sum to 1 (got ${female + male})`,
      });
    }
    return issues;
  },
  (p) => {
    const issues: ValidationIssue[] = [];
    const labs = p.initial_labs ?? {};
    for (const [labName, spec] of Object.entries(labs)) {
      for (const sev of ["mild", "moderate", "severe"] as const) {
        const sevSpec = spec[sev];
        if (!sevSpec) continue;
        const [lo, hi] = sevSpec.range;
        if (lo >= hi) {
          issues.push({
            profileId: p.profile_id,
            severity: "error",
            message: `${labName}/${sev} range invalid: [${lo}, ${hi}]`,
          });
        }
        if (sevSpec.referral_prob !== undefined && (sevSpec.referral_prob < 0 || sevSpec.referral_prob > 1)) {
          issues.push({
            profileId: p.profile_id,
            severity: "error",
            message: `${labName}/${sev} referral_prob out of [0,1]`,
          });
        }
      }
      // HbA1c-specific window check
      if (labName === "hba1c") {
        const mild = spec.mild?.range, mod = spec.moderate?.range, sev = spec.severe?.range;
        if (mild && mild[1] >= 59) issues.push({ profileId: p.profile_id, severity: "warning", message: `hba1c mild upper >= 59 (expected <58)` });
        if (mod && (mod[0] < 59 || mod[1] > 80)) issues.push({ profileId: p.profile_id, severity: "warning", message: `hba1c moderate out of 59..80` });
        if (sev && sev[0] < 80) issues.push({ profileId: p.profile_id, severity: "warning", message: `hba1c severe lower < 80` });
      }
    }
    return issues;
  },
  (p) => {
    const issues: ValidationIssue[] = [];
    for (const co of p.comorbidities ?? []) {
      if (co.probability < 0 || co.probability > 1) {
        issues.push({ profileId: p.profile_id, severity: "error", message: `Comorbidity ${co.profile}: probability out of [0,1]` });
      }
    }
    return issues;
  },
];

function loadProfile(file: string): PatientProfile {
  const raw = readFileSync(join(PROFILES_DIR, file), "utf-8");
  return load(raw) as PatientProfile;
}

async function main() {
  const yamlFiles = readdirSync(PROFILES_DIR).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
  console.log(`Validerar ${yamlFiles.length} profiler från ${PROFILES_DIR}…`);

  const profiles: PatientProfile[] = [];
  const issues: ValidationIssue[] = [];

  for (const file of yamlFiles) {
    let p: PatientProfile;
    try {
      p = loadProfile(file);
    } catch (err) {
      issues.push({ profileId: file, severity: "error", message: `YAML parse failed: ${err}` });
      continue;
    }
    profiles.push(p);
    for (const rule of CLINICAL_RULES) {
      issues.push(...rule(p));
    }
  }

  // Cross-referential check: comorbidities point to other existing profiles
  const profileIds = new Set(profiles.map((p) => p.profile_id));
  for (const p of profiles) {
    for (const co of p.comorbidities ?? []) {
      if (!profileIds.has(co.profile)) {
        issues.push({ profileId: p.profile_id, severity: "error", message: `Comorbidity references unknown profile: ${co.profile}` });
      }
    }
  }

  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");

  console.log(`Profiler laddade: ${profiles.length}`);
  console.log(`Errors: ${errors.length}, Warnings: ${warnings.length}`);
  for (const i of issues) {
    console.log(`  [${i.severity.toUpperCase()}] ${i.profileId}: ${i.message}`);
  }

  if (errors.length > 0) {
    process.exit(2);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
