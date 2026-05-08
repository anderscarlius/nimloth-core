// Audit-emission för composition-mapper (P4 4.7).
//
// Skriver MappingAuditEvent till SQLite-outbox vid varje mapping. Outbox
// drainerar mot Kafka topic `core.audit.access` via existerande
// AuditPublisher (B15-scaffold, lazy-connect — Kafka-producer instantieras
// först vid första drain() med pending events).
//
// PDL-kritiskt: prompt-hash (SHA256 från model-router) inkluderas i
// event-payloaden — INTE den faktiska prompten. Patientdata får inte
// loggas i klartext.

import { randomUUID } from 'node:crypto';
import type { CompositionMapperDb } from './db.js';
import type { MedicationStatement } from './validation/fhir.js';
import type { AggregationResult, FieldEvidence } from './types/review.js';

// ============================================================
// Event-format
// ============================================================

export type MappingAuditAction =
  | 'MAPPING_COMPOSE'
  | 'MAPPING_REVIEW_REQUIRED'
  | 'MAPPING_FAILED';

export type MappingAuditOutcome = 'SUCCESS' | 'REVIEW' | 'ERROR';

export interface MappingAuditEvent {
  eventId: string; // UUID
  timestamp: string; // ISO 8601
  actor: { hsaId: string; role: 'system' };
  action: MappingAuditAction;
  resourceType: 'MedicationStatement';
  resourceId: string;
  patientId: string | null;
  outcome: MappingAuditOutcome;
  details: {
    aggregateConfidence: number;
    fieldEvidenceCount: number;
    deterministicFieldCount: number;
    llmFieldCount: number;
    triggerReason?: string;
    promptHashes?: string[]; // SHA256-hashar från model-router (en per LLM-anrop)
  };
}

// ============================================================
// Build event från MedicationStatement + AggregationResult
// ============================================================

const SYSTEM_HSA_ID = 'system:composition-mapper';

function extractPatientId(ms: MedicationStatement): string | null {
  const ref = ms.subject.reference;
  const parts = ref.split('/');
  if (parts.length !== 2 || !parts[1]) return null;
  return parts[1];
}

function actionFor(result: AggregationResult): MappingAuditAction {
  return result.status === 'human-review-required'
    ? 'MAPPING_REVIEW_REQUIRED'
    : 'MAPPING_COMPOSE';
}

function outcomeFor(result: AggregationResult): MappingAuditOutcome {
  return result.status === 'human-review-required' ? 'REVIEW' : 'SUCCESS';
}

function countBySource(evidence: FieldEvidence[], src: 'deterministic' | 'llm'): number {
  return evidence.filter((e) => e.source === src).length;
}

export interface BuildEventOptions {
  /** Prompt-hashes från model-router router.invoke()-svar.
   *  Caller måste samla in dessa under mappning. Tom array är OK. */
  promptHashes?: string[];
}

export function buildMappingAuditEvent(
  ms: MedicationStatement,
  inputId: string,
  result: AggregationResult,
  options: BuildEventOptions = {},
): MappingAuditEvent {
  return {
    eventId: randomUUID(),
    timestamp: new Date().toISOString(),
    actor: { hsaId: SYSTEM_HSA_ID, role: 'system' },
    action: actionFor(result),
    resourceType: 'MedicationStatement',
    resourceId: inputId,
    patientId: extractPatientId(ms),
    outcome: outcomeFor(result),
    details: {
      aggregateConfidence: result.aggregateConfidence,
      fieldEvidenceCount: result.fieldEvidence.length,
      deterministicFieldCount: countBySource(result.fieldEvidence, 'deterministic'),
      llmFieldCount: countBySource(result.fieldEvidence, 'llm'),
      ...(result.reviewPayload?.triggerReason
        ? { triggerReason: result.reviewPayload.triggerReason }
        : {}),
      ...(options.promptHashes && options.promptHashes.length > 0
        ? { promptHashes: options.promptHashes }
        : {}),
    },
  };
}

// ============================================================
// AuditEmitter — thin wrapper kring db.enqueueAudit
// ============================================================

export interface AuditEmitterDeps {
  db: CompositionMapperDb;
}

/**
 * Skriver event till outbox. Drainering till Kafka sker periodiskt via
 * AuditPublisher.start() (B15-scaffold). Lazy-connect — första pending
 * event triggar Kafka-anslutning.
 */
export function emitMappingAudit(deps: AuditEmitterDeps, event: MappingAuditEvent): void {
  deps.db.enqueueAudit({
    event_id: event.eventId,
    event_type: event.action,
    payload: event,
  });
}

/**
 * Convenience: bygg + emit i ett anrop. Föredragen från
 * mapMedicationStatement-pipelinen.
 */
export function buildAndEmit(
  deps: AuditEmitterDeps,
  ms: MedicationStatement,
  inputId: string,
  result: AggregationResult,
  options: BuildEventOptions = {},
): MappingAuditEvent {
  const event = buildMappingAuditEvent(ms, inputId, result, options);
  emitMappingAudit(deps, event);
  return event;
}
