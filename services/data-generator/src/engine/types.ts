import type { Severity, PatientProfile } from "../types/profiles.js";
import type { SdgEventType } from "../composers/index.js";

export interface Demographics {
  age: number;
  sex: "female" | "male";
  bmi: number;
}

export interface ClinicalSeed {
  /** Severity-bucket the patient lands in for the primary lab. */
  severity: Severity;
  /** Sampled lab values (key = lab name from profile, value = magnitude). */
  labs: Record<string, number>;
}

export interface PatientContext {
  patientId: string;
  profileId: string;
  seed: number;
  demographics: Demographics;
  clinical: ClinicalSeed;
}

export interface TimelineEvent {
  dayOffset: number;
  eventType: SdgEventType;
  /** Free-form clinical payload — composers decide what to use. */
  clinicalData: {
    magnitude?: number;
    realUnit?: string;
    careflowStep?: string;
    annotation: string;
  };
}

export interface PatientTimeline {
  patientId: string;
  profileId: string;
  seed: number;
  demographics: Demographics;
  clinical: ClinicalSeed;
  events: TimelineEvent[];
}

export interface PathwayState {
  compositions?: SdgEventType[];
  day_offset?: number | { min: number; max: number };
  transitions?: PathwayTransition[];
  terminal?: boolean;
  /** SDG-09: multiplikator för primary-lab-värde när detta state emittas.
   *  Used by responder/nonresponder-followup states i diabetes-pathwayen
   *  så lastHBA1C < firstHBA1C (responder, AQL-10) eller > firstHBA1C
   *  (nonresponder, AQL-14). Default 1.0 (oförändrat värde). */
  lab_factor?: number;
}

export interface PathwayTransition {
  to: string;
  /** Either "always" or a JS-like expression evaluated against ClinicalSeed. */
  condition: string;
  compositions?: SdgEventType[];
}

export interface PathwayDefinition {
  pathway_id: string;
  initial_state: string;
  states: Record<string, PathwayState>;
}

export interface EngineInputs {
  profile: PatientProfile;
  pathway: PathwayDefinition;
  /** Reproducibility — seeded PRNG. */
  seed: number;
  patientIndex: number;
}
