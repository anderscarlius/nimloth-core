// Aggregator (P4 4.6) — kombinerar deterministisk (4.3) + LLM-assist (4.5)
// resultat per fält till en ExpectedFields-projektion + bestämmer om
// human-review krävs.
//
// Konfidens-aggregeringsregel: MIN av per-fält-confidence (konservativ).
// Threshold default 0.7 — kalibreras i 4.9 mot eval-set.
//
// Triggers för human-review-required:
//   - low_confidence: aggregateConfidence < threshold
//   - missing_required_field: medicationName/status/subject saknas
//   - conflicting_evidence: deterministic ≠ LLM (om båda producerar värde)
//
// Pure function — inga sidoeffekter, inga async-anrop.

import type {
  AggregationResult,
  ExpectedFields,
  FieldEvidence,
  HumanReviewPayload,
  MedicationNameValue,
  RouteValue,
  SubjectValue,
  TriggerReason,
} from '../types/review.js';
import { REQUIRED_FIELD_KEYS } from '../types/review.js';
import type { MappedField } from './deterministic.js';
import type { DosageQuantity, Frequency, LlmField, StatusInference } from './llm-assist.js';

export const DEFAULT_CONFIDENCE_THRESHOLD = 0.7;

/**
 * LLM-resultat-bunten som aggregator tar emot. Alla fält optionella —
 * caller anropar bara LLM-metoder för fält där deterministic var null
 * (eller alltid, kalibreringsfråga för 4.9).
 */
export interface LlmResults {
  doseQuantity?: LlmField<DosageQuantity> | null;
  frequency?: LlmField<Frequency> | null;
  status?: LlmField<StatusInference> | null;
  // ATC kompletterar medicationName om deterministic returnerade UNKNOWN-code
  atc?: LlmField<{ code: string | null; display: string | null }> | null;
}

/**
 * Deterministisk-resultat-bunten (från applyDeterministicMappings).
 * Använder unknown-typ eftersom value-formatet skiljer per fält.
 */
export interface DeterministicResults {
  medicationName: MappedField<MedicationNameValue> | null;
  status: MappedField<string> | null;
  startTime: MappedField<string> | null;
  route: MappedField<RouteValue> | null;
  sequence: MappedField<number> | null;
  subject: MappedField<SubjectValue> | null;
}

// ============================================================
// Aggregator
// ============================================================

export function aggregate(
  deterministic: DeterministicResults,
  llm: LlmResults,
  inputId: string,
  threshold: number = DEFAULT_CONFIDENCE_THRESHOLD,
): AggregationResult {
  const fieldEvidence: FieldEvidence[] = [];
  const composition: Partial<ExpectedFields> = {};
  let conflictDetected = false;

  // ---- 1. medicationName (deterministic primary, LLM ATC fallback) ----
  if (deterministic.medicationName) {
    const detVal = deterministic.medicationName.value;
    fieldEvidence.push({
      fieldName: 'medicationName',
      source: 'deterministic',
      value: detVal,
      confidence: 1.0,
    });
    composition.medicationName = { value: detVal };
    // Conflicting check: om LLM ATC också producerar en kod som skiljer
    if (llm.atc?.value.code && detVal.code !== llm.atc.value.code) {
      conflictDetected = true;
    }
  } else if (llm.atc?.value.code && llm.atc.value.display) {
    const llmVal: MedicationNameValue = {
      name: llm.atc.value.display,
      code: llm.atc.value.code,
      system: 'http://www.whocc.no/atc',
    };
    fieldEvidence.push({
      fieldName: 'medicationName',
      source: 'llm',
      value: llmVal,
      confidence: llm.atc.confidence,
      reasoning: llm.atc.reasoning,
      attempts: llm.atc.attempts,
    });
    composition.medicationName = { value: llmVal };
  } else {
    fieldEvidence.push({
      fieldName: 'medicationName',
      source: 'unknown',
      value: null,
      confidence: 0,
    });
  }

  // ---- 2. status (deterministic primary, LLM inferStatus fallback) ----
  if (deterministic.status) {
    fieldEvidence.push({
      fieldName: 'status',
      source: 'deterministic',
      value: deterministic.status.value,
      confidence: 1.0,
    });
    composition.status = { value: deterministic.status.value };
    if (llm.status?.value.status && deterministic.status.value !== llm.status.value.status) {
      conflictDetected = true;
    }
  } else if (llm.status?.value.status) {
    fieldEvidence.push({
      fieldName: 'status',
      source: 'llm',
      value: llm.status.value.status,
      confidence: llm.status.confidence,
      reasoning: llm.status.reasoning,
      attempts: llm.status.attempts,
    });
    composition.status = { value: llm.status.value.status };
  } else {
    fieldEvidence.push({
      fieldName: 'status',
      source: 'unknown',
      value: null,
      confidence: 0,
    });
  }

  // ---- 3. startTime, route, sequence, subject — deterministic only ----
  for (const key of ['startTime', 'route', 'sequence', 'subject'] as const) {
    const det = deterministic[key];
    if (det) {
      fieldEvidence.push({
        fieldName: key,
        source: 'deterministic',
        value: det.value,
        confidence: 1.0,
      });
      // Type narrow per fält för att hålla composition-typen exakt
      if (key === 'startTime') composition.startTime = { value: det.value as string };
      else if (key === 'route') composition.route = { value: det.value as RouteValue };
      else if (key === 'sequence') composition.sequence = { value: det.value as number };
      else if (key === 'subject') composition.subject = { value: det.value as SubjectValue };
    } else {
      fieldEvidence.push({
        fieldName: key,
        source: 'unknown',
        value: null,
        confidence: 0,
      });
    }
  }

  // ---- 4. doseQuantity (LLM only) ----
  // Tre case-distinktion (B22.5.6):
  //  (a) LLM gav värde       → source: 'llm', confidence från modell
  //  (b) LLM kallades men sa "vet inte" (value: null OCH confidence: 0/lågt)
  //      → source: 'llm', confidence: 0 (BIDRAR till min-aggregat → kan trigga
  //         low_confidence). Detta är essentialen för review-pathway när
  //         prompts korrekt flaggar tvetydig fritext (B22.5.6 Iter 1).
  //  (c) LLM kallades inte alls (text saknades / parseDosageText returnerade null)
  //      → source: 'unknown' (skips i min-aggregaten — fältet är inte tillämpligt)
  if (llm.doseQuantity?.value.value != null && llm.doseQuantity.value.unit) {
    const dq = { value: llm.doseQuantity.value.value, unit: llm.doseQuantity.value.unit };
    fieldEvidence.push({
      fieldName: 'doseQuantity',
      source: 'llm',
      value: dq,
      confidence: llm.doseQuantity.confidence,
      reasoning: llm.doseQuantity.reasoning,
      attempts: llm.doseQuantity.attempts,
    });
    composition.doseQuantity = { value: dq };
  } else if (llm.doseQuantity != null) {
    // LLM kallades men returnerade null — explicit "vet inte"
    fieldEvidence.push({
      fieldName: 'doseQuantity',
      source: 'llm',
      value: null,
      confidence: llm.doseQuantity.confidence,
      reasoning: llm.doseQuantity.reasoning,
      attempts: llm.doseQuantity.attempts,
    });
  } else {
    fieldEvidence.push({
      fieldName: 'doseQuantity',
      source: 'unknown',
      value: null,
      confidence: 0,
    });
  }

  // ---- 5. frequency (LLM only) — samma 3-case-mönster som doseQuantity ----
  if (llm.frequency?.value.code) {
    fieldEvidence.push({
      fieldName: 'frequency',
      source: 'llm',
      value: llm.frequency.value.code,
      confidence: llm.frequency.confidence,
      reasoning: llm.frequency.reasoning,
      attempts: llm.frequency.attempts,
    });
    composition.frequency = { value: llm.frequency.value.code };
  } else if (llm.frequency != null) {
    // LLM kallades men returnerade code: null — explicit "vet inte"
    fieldEvidence.push({
      fieldName: 'frequency',
      source: 'llm',
      value: null,
      confidence: llm.frequency.confidence,
      reasoning: llm.frequency.reasoning,
      attempts: llm.frequency.attempts,
    });
  } else {
    fieldEvidence.push({
      fieldName: 'frequency',
      source: 'unknown',
      value: null,
      confidence: 0,
    });
  }

  // ---- 6. indication — out-of-scope för P4 LLM (placeholder unknown) ----
  fieldEvidence.push({
    fieldName: 'indication',
    source: 'unknown',
    value: null,
    confidence: 0,
  });

  // ---- Aggregate-confidence: min över bara fält som har value (≠ unknown) ----
  const knownEvidence = fieldEvidence.filter((e) => e.source !== 'unknown');
  const aggregateConfidence =
    knownEvidence.length === 0 ? 0 : Math.min(...knownEvidence.map((e) => e.confidence));

  // ---- Trigger-evaluation ----
  const missingRequired = REQUIRED_FIELD_KEYS.filter(
    (k) => composition[k] == null,
  );

  let triggerReason: TriggerReason | null = null;
  if (missingRequired.length > 0) {
    triggerReason = 'missing_required_field';
  } else if (conflictDetected) {
    triggerReason = 'conflicting_evidence';
  } else if (aggregateConfidence < threshold) {
    triggerReason = 'low_confidence';
  }

  if (triggerReason) {
    const reviewPayload: HumanReviewPayload = {
      inputId,
      triggerReason,
      aggregateConfidence,
      fields: fieldEvidence,
      proposedComposition: composition,
      timestamp: new Date().toISOString(),
    };
    return {
      status: 'human-review-required',
      composition,
      reviewPayload,
      fieldEvidence,
      aggregateConfidence,
    };
  }

  return {
    status: 'complete',
    composition,
    reviewPayload: null,
    fieldEvidence,
    aggregateConfidence,
  };
}
