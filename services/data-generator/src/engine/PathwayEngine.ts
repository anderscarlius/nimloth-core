import { readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "js-yaml";
import type seedrandom from "seedrandom";
import type {
  PathwayDefinition,
  PathwayState,
  PathwayTransition,
  TimelineEvent,
  PatientContext,
} from "./types.js";
import type { SdgEventType } from "../composers/index.js";
import { assertAnnotation } from "./annotation-contract.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, "..", "..");
export const PATHWAYS_DIR = join(PKG_ROOT, "pathways");

export function loadPathway(pathwayId: string): PathwayDefinition {
  const raw = readFileSync(join(PATHWAYS_DIR, `${pathwayId}.yaml`), "utf-8");
  return load(raw) as PathwayDefinition;
}

function resolveDayOffset(
  spec: PathwayState["day_offset"],
  rng: seedrandom.PRNG,
): number {
  if (spec === undefined) return 0;
  if (typeof spec === "number") return spec;
  return Math.round(spec.min + rng() * (spec.max - spec.min));
}

function evalCondition(
  condition: string,
  ctx: PatientContext,
  rng: seedrandom.PRNG,
): boolean {
  if (condition === "always") return true;
  // Limited expression eval: supports comparisons against ctx.clinical.labs and severity.
  // Format examples:
  //   "lab.hba1c >= 70"
  //   "severity == severe"
  //   "lab.hba1c >= 70 OR severity == severe"
  //   "random < 0.35"
  const sanitized = condition
    .replace(/\bAND\b/g, "&&")
    .replace(/\bOR\b/g, "||")
    .replace(/\blab\.([a-z0-9_]+)/g, "(ctx.clinical.labs.$1 ?? 0)")
    .replace(/\bseverity\b/g, "ctx.clinical.severity")
    .replace(/==/g, "===")
    .replace(/!=/g, "!==")
    .replace(/\brandom\b/g, "rng()")
    .replace(/(===\s*)(mild|moderate|severe)\b/g, "$1'$2'");

  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function("ctx", "rng", `return (${sanitized});`);
    return Boolean(fn(ctx, rng));
  } catch (err) {
    console.warn(`Failed to eval condition "${condition}": ${err}`);
    return false;
  }
}

// Fas 3 AC3 — profil → primär ICD-diagnoskod. Normaliserar diabetes_typ2-
// profilen till äkta E11 (inte profil-taggen) så AQL-01/06 + den registrerade
// honest-mallen kan nyckla på EN äkta kod, ej en syntetisk tagg. Övriga
// profiler (hypertoni/hjartsvikt/kol…) behåller sin tagg tills en befordrad
// mall nycklar på dem (loggat kvarvarande — samma princip).
const PROFILE_PRIMARY_ICD: Record<string, { icd: string; name: string }> = {
  diabetes_typ2: { icd: "E11", name: "Diabetes mellitus typ 2" },
};

function clinicalAnnotationRaw(
  eventType: SdgEventType,
  ctx: PatientContext,
  state: string,
  labFactor = 1.0,
): { magnitude?: number; realUnit?: string; careflowStep?: string; annotation: string } {
  // Map event type to "interesting" clinical payload by event-type.
  switch (eventType) {
    case "primary_care_encounter":
      return {
        careflowStep: state,
        annotation: `primary_care_encounter | first_visit | ${ctx.profileId} initial contact`,
      };
    case "vital_signs": {
      const m = ctx.clinical.labs.systolic_bp ?? 130 + Math.round((ctx.clinical.labs.diastolic_bp ?? 80) - 80);
      return {
        magnitude: m,
        realUnit: "mm[Hg]",
        annotation: `vital_signs | BP | systolic ${m} mm[Hg]`,
      };
    }
    case "lab_order":
      return {
        careflowStep: "lab_ordered",
        annotation: `lab_order | ${ctx.profileId} | initial workup`,
      };
    case "lab_result": {
      const labs = ctx.clinical.labs;
      const key =
        labs.hba1c !== undefined
          ? "hba1c"
          : labs.troponin !== undefined
            ? "troponin"
            : labs.ntprobnp !== undefined
              ? "ntprobnp"
              : labs.hemoglobin !== undefined
                ? "hemoglobin"
                : Object.keys(labs)[0];
      const rawM = key ? labs[key] : 0;
      // SDG-09: state.lab_factor modulerar follow-up-värdet när !=1.0.
      // labFactor < 1.0 → responder (sjunkande), > 1.0 → non-responder (stigande).
      // labFactor === 1.0 (default) → returnera rå värde oförändrat så
      // baseline-snapshot för Marianne och övriga oberörda pathways bevaras.
      const m = labFactor === 1.0 ? rawM : Math.round(rawM * labFactor * 10) / 10;
      const realUnit =
        key === "hba1c" ? "mmol/mol" : key === "hemoglobin" ? "g/L" : "1";
      return {
        magnitude: m,
        realUnit,
        annotation: `lab_result | ${(key ?? "value").toUpperCase()} | ${m} ${realUnit}`,
      };
    }
    case "problem_diagnosis": {
      const primary = PROFILE_PRIMARY_ICD[ctx.profileId];
      if (primary) {
        return {
          magnitude: 1,
          realUnit: "1",
          annotation: `problem_diagnosis | ${primary.icd} | ${primary.name}, severity=${ctx.clinical.severity}`,
        };
      }
      // Övriga profiler: profil-tagg kvar (kvarvarande — fix när befordrad mall nycklar på dem).
      return {
        magnitude: 1,
        realUnit: "1",
        annotation: `problem_diagnosis | ${ctx.profileId} | severity=${ctx.clinical.severity}`,
      };
    }
    case "medication_statement":
      return {
        magnitude: 1,
        realUnit: "rx",
        annotation: `medication_statement | ${ctx.profileId} | initial therapy`,
      };
    case "referral":
      return {
        careflowStep: "referral",
        annotation: `referral | ${ctx.profileId} | severity=${ctx.clinical.severity}`,
      };
    case "specialist_consultation":
      return {
        careflowStep: "specialist_seen",
        annotation: `specialist_consultation | ${ctx.profileId} | follow-up`,
      };
    case "care_plan":
      return {
        magnitude: 3,
        realUnit: "mo",
        annotation: `care_plan | followup | ${ctx.profileId} 3-month review`,
      };
    case "discharge_summary":
      return {
        magnitude: 1,
        realUnit: "1",
        annotation: `discharge_summary | ${ctx.profileId} | episode end`,
      };
    case "adverse_reaction":
      // Pathways emitterar aldrig adverse_reaction (det är ankar-only, Fas 3
      // AC2). Defensiv gren för uttömmande switch — träffas ej i praktiken.
      return {
        annotation: `adverse_reaction | ${ctx.profileId} | unspecified`,
      };
  }
}

// PATCH B: validera annotation-kontraktet vid genereringstid (fail loud).
function clinicalAnnotation(
  eventType: SdgEventType,
  ctx: PatientContext,
  state: string,
  labFactor = 1.0,
): { magnitude?: number; realUnit?: string; careflowStep?: string; annotation: string } {
  const result = clinicalAnnotationRaw(eventType, ctx, state, labFactor);
  assertAnnotation(result.annotation, eventType);
  return result;
}

export function runPathway(
  pathway: PathwayDefinition,
  ctx: PatientContext,
  rng: seedrandom.PRNG,
  maxSteps = 12,
): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  let stateName = pathway.initial_state;
  let day = 0;
  let stepCount = 0;

  while (stateName && stepCount < maxSteps) {
    const state: PathwayState | undefined = pathway.states[stateName];
    if (!state) break;
    if (state.terminal) break;

    day += resolveDayOffset(state.day_offset, rng);

    const labFactor = state.lab_factor ?? 1.0;
    for (const eventType of state.compositions ?? []) {
      events.push({
        dayOffset: day,
        eventType,
        clinicalData: clinicalAnnotation(eventType, ctx, stateName, labFactor),
      });
    }

    const transitions: PathwayTransition[] = state.transitions ?? [];
    const taken = transitions.find((t) => evalCondition(t.condition, ctx, rng));
    if (!taken) break;

    for (const eventType of taken.compositions ?? []) {
      events.push({
        dayOffset: day,
        eventType,
        clinicalData: clinicalAnnotation(eventType, ctx, stateName, labFactor),
      });
    }

    stateName = taken.to;
    stepCount++;
  }

  return events;
}
