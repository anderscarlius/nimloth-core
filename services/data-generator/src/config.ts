export const EHRBASE_BASE_URL =
  process.env.EHRBASE_BASE_URL ?? "http://192.168.1.189:11401/ehrbase";

export const OPENEHR_REST = `${EHRBASE_BASE_URL}/rest/openehr/v1`;
export const ADMIN_REST = `${EHRBASE_BASE_URL}/rest/admin`;

export const TARGET_TEMPLATES = [
  "primary_care_encounter",
  "vital_signs",
  "lab_order",
  "lab_result",
  "problem_diagnosis",
  "medication_statement",
  "referral",
  "specialist_consultation",
  "care_plan",
  "discharge_summary",
] as const;

export type TargetTemplateId = (typeof TARGET_TEMPLATES)[number];
