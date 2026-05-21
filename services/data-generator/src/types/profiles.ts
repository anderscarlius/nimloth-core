// Patient profile type. Validated against profiles/schema.json + clinical
// reasonableness rules in scripts/validate-profiles.ts.

export interface PatientProfile {
  profile_id: string;
  display_name: string;
  icd10: string;
  demographics: Demographics;
  initial_labs?: Record<string, LabSpec>;
  common_medications?: MedicationSpec[];
  comorbidities?: ComorbiditySpec[];
  care_pathway: string;
  seed_patient?: SeedPatient;
}

export interface Demographics {
  age_range: [number, number];
  sex_distribution: { female: number; male: number };
  bmi_range?: [number, number];
}

export interface LabSpec {
  mild?: SeveritySpec;
  moderate?: SeveritySpec;
  severe?: SeveritySpec;
  range?: [number, number];
  unit?: string;
}

export interface SeveritySpec {
  range: [number, number];
  referral_prob?: number;
}

export interface MedicationSpec {
  atc: string;
  name: string;
  dose?: string;
  prob?: number;
}

export interface ComorbiditySpec {
  profile: string;
  probability: number;
  min_age?: number;
}

export interface SeedPatient {
  name?: string;
  age?: number;
  medications?: string[];
  note?: string;
}

export type Severity = "mild" | "moderate" | "severe";
