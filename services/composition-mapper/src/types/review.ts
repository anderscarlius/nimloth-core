// Type-definitioner för aggregator + human-review-payload (P4 4.6).
// Immutabel utan spec-uppdatering per AC8 — ändringar kräver revision i
// nimloth-docs/P4_Composition_Mapper.md sektion 4.6 + bump av version-tag.

// ============================================================
// ExpectedFields — output-format som matchar eval-set:s expected_fields
// (P4 spec sektion 4.4 v2.1, format LÅST 2026-05-08).
// ============================================================

export interface MedicationNameValue {
  name: string;
  code: string;
  system: string;
}

export interface RouteValue {
  value: string;
  terminology: string;
  code: string;
}

export interface SubjectValue {
  namespace: string;
  type: string;
  id: string;
}

export interface DoseQuantityValue {
  value: number;
  unit: string;
}

export interface ExpectedFields {
  medicationName: { value: MedicationNameValue } | null;
  status: { value: string } | null;
  startTime: { value: string } | null;
  route: { value: RouteValue } | null;
  sequence: { value: number } | null;
  subject: { value: SubjectValue } | null;
  doseQuantity: { value: DoseQuantityValue } | null;
  frequency: { value: string } | null;
  indication: { value: string } | null;
}

export const EXPECTED_FIELD_KEYS: ReadonlyArray<keyof ExpectedFields> = [
  'medicationName',
  'status',
  'startTime',
  'route',
  'sequence',
  'subject',
  'doseQuantity',
  'frequency',
  'indication',
] as const;

/** Required-fält för status='complete'. Saknad → human-review-required. */
export const REQUIRED_FIELD_KEYS: ReadonlyArray<keyof ExpectedFields> = [
  'medicationName',
  'status',
  'subject',
] as const;

// ============================================================
// FieldEvidence — per-fält audit-trail (deterministic vs LLM)
// ============================================================

export interface FieldEvidence {
  fieldName: keyof ExpectedFields;
  source: 'deterministic' | 'llm' | 'unknown';
  value: unknown | null;
  confidence: number; // 0..1
  reasoning?: string; // bara från LLM
  attempts?: number; // bara från LLM (1..3)
}

// ============================================================
// HumanReviewPayload — emittas till caller när status=review-required
// ============================================================

export type TriggerReason =
  | 'low_confidence'
  | 'missing_required_field'
  | 'conflicting_evidence';

export interface HumanReviewPayload {
  inputId: string;
  triggerReason: TriggerReason;
  aggregateConfidence: number;
  fields: FieldEvidence[];
  proposedComposition: Partial<ExpectedFields>;
  timestamp: string;
}

// ============================================================
// AggregationResult — return-type från aggregate()
// ============================================================

export interface AggregationResult {
  status: 'complete' | 'human-review-required';
  composition: Partial<ExpectedFields>;
  reviewPayload: HumanReviewPayload | null;
  fieldEvidence: FieldEvidence[];
  aggregateConfidence: number;
}
