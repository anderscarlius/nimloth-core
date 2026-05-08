// High-level mapping-orkestrerare för composition-mapper.
//
// applyDeterministicMappings (4.3) — pure orchestration över sex 1:1-mappare
// mapMedicationStatement (4.6) — full pipeline: deterministic → LLM (för
//   null-fält) → aggregator → AggregationResult.
//
// LLM anropas bara för fält där deterministic returnerade null. Det är
// effektivt (färre LLM-anrop) men konservativt — 4.9 kan visa att
// "alltid LLM"-approach ger bättre accuracy och föranleda revision.

import type { MedicationStatement } from '../validation/fhir.js';
import {
  mapMedicationName,
  mapStatus,
  mapStartTime,
  mapRoute,
  mapSequence,
  mapSubject,
  type MappedField,
} from './deterministic.js';
import {
  aggregate,
  DEFAULT_CONFIDENCE_THRESHOLD,
  type DeterministicResults,
  type LlmResults,
} from './aggregator.js';
import type { LlmAssist } from './llm-assist.js';
import type { AggregationResult } from '../types/review.js';
import { buildAndEmit, type AuditEmitterDeps, type MappingAuditEvent } from '../audit.js';

export type DeterministicResult = Record<string, MappedField<unknown> | null>;

export const DETERMINISTIC_FIELD_KEYS = [
  'medicationName',
  'status',
  'startTime',
  'route',
  'sequence',
  'subject',
] as const;
export type DeterministicFieldKey = (typeof DETERMINISTIC_FIELD_KEYS)[number];

/**
 * Applicerar de sex deterministiska mapparna och returnerar resultat keyed
 * på fält-namn. Pure function. Behåller bakåtkompatibel signatur från 4.3
 * för existerande tester.
 */
export function applyDeterministicMappings(ms: MedicationStatement): DeterministicResult {
  return {
    medicationName: mapMedicationName(ms),
    status: mapStatus(ms),
    startTime: mapStartTime(ms),
    route: mapRoute(ms),
    sequence: mapSequence(ms),
    subject: mapSubject(ms),
  };
}

/**
 * Strukturerad variant som direkt matchar aggregator:s DeterministicResults-typ.
 * Föredragen vid full-pipeline-anrop (mapMedicationStatement).
 */
export function applyDeterministicMappingsTyped(ms: MedicationStatement): DeterministicResults {
  return {
    medicationName: mapMedicationName(ms),
    status: mapStatus(ms),
    startTime: mapStartTime(ms),
    route: mapRoute(ms),
    sequence: mapSequence(ms),
    subject: mapSubject(ms),
  };
}

// ============================================================
// mapMedicationStatement — full pipeline (P4 4.6)
// ============================================================

export interface MapMedicationStatementOptions {
  /** Anropa LlmAssist för fält där deterministic returnerade null. Default true. */
  useLlm?: boolean;
  /** Confidence-threshold för human-review-trigger. Default 0.7. */
  threshold?: number;
}

export interface MapMedicationStatementDeps {
  /** LlmAssist-instans. Required om useLlm=true. */
  llm?: LlmAssist;
  /** Audit-emit-deps. Optional — om saknas hoppar audit-emission. */
  audit?: AuditEmitterDeps;
}

export interface MapMedicationStatementOutput extends AggregationResult {
  /** Audit-event som emittades. Null om audit-deps saknades. */
  auditEvent: MappingAuditEvent | null;
}

export async function mapMedicationStatement(
  ms: MedicationStatement,
  inputId: string,
  deps: MapMedicationStatementDeps = {},
  options: MapMedicationStatementOptions = {},
): Promise<MapMedicationStatementOutput> {
  const useLlm = options.useLlm ?? true;
  const threshold = options.threshold ?? DEFAULT_CONFIDENCE_THRESHOLD;

  const deterministic = applyDeterministicMappingsTyped(ms);
  const llmResults: LlmResults = {};

  if (useLlm && deps.llm) {
    // doseQuantity: alltid LLM (deterministic täcker inte detta fält)
    llmResults.doseQuantity = await deps.llm.parseDosageText(ms);
    // frequency: alltid LLM
    llmResults.frequency = await deps.llm.parseDosageTiming(ms);
    // status: bara LLM om deterministic var null (status är required, så
    // inferens är värdefullt)
    if (deterministic.status === null) {
      llmResults.status = await deps.llm.inferStatus(ms);
    }
    // ATC-suggestion: bara om deterministic medicationName saknas eller
    // har "UNKNOWN"-kod (lokala formularieposter etc.)
    const detCode = deterministic.medicationName?.value.code;
    if (!detCode || detCode === 'UNKNOWN' || /^LOCAL-/.test(detCode)) {
      llmResults.atc = await deps.llm.suggestAtc(ms);
    }
  }

  const result = aggregate(deterministic, llmResults, inputId, threshold);

  let auditEvent: MappingAuditEvent | null = null;
  if (deps.audit) {
    auditEvent = buildAndEmit(deps.audit, ms, inputId, result);
  }

  return { ...result, auditEvent };
}
