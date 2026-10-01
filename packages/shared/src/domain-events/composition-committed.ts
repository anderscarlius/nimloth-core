// CompositionCommitted v1 — builder + konstant för WP-EVT1.

import { randomUUID } from 'node:crypto';
import type { BaseEvent } from '../types/events.js';
import { TOPICS } from '../schemas/topics.js';

export const COMPOSITION_COMMITTED_EVENT_VERSION = '1.0.0';

export const COMPOSITION_COMMITTED_EVENT_TYPE = TOPICS.domain.compositionCommitted;

export interface CompositionCommittedPayload {
  composition_uid: string;
  ehr_id: string;
  template_id: string;
  committed_at: string;
  trigger_event_id: string;
  trigger_event_type: string;
  canonical_store?: 'openehr';
}

export interface CompositionCommittedEvent extends BaseEvent {
  event_type: typeof COMPOSITION_COMMITTED_EVENT_TYPE;
  event_version: typeof COMPOSITION_COMMITTED_EVENT_VERSION;
  source_system: 'core';
  payload: CompositionCommittedPayload;
}

export interface BuildCompositionCommittedInput {
  patient_id: string;
  composition_uid: string;
  ehr_id: string;
  template_id: string;
  trigger_event_id: string;
  trigger_event_type: string;
  correlation_id?: string;
  committed_at?: string;
}

/** Bygger ett validerbart CompositionCommitted v1-event (dataklass 0). */
export function buildCompositionCommittedEvent(
  input: BuildCompositionCommittedInput,
): CompositionCommittedEvent {
  const event_id = randomUUID();
  return {
    event_id,
    event_type: COMPOSITION_COMMITTED_EVENT_TYPE,
    event_version: COMPOSITION_COMMITTED_EVENT_VERSION,
    timestamp: input.committed_at ?? new Date().toISOString(),
    source_system: 'core',
    source_instance: 'openehr-composer',
    patient_id: input.patient_id,
    producer_id: 'system:openehr-composer',
    correlation_id: input.correlation_id ?? input.trigger_event_id,
    payload: {
      composition_uid: input.composition_uid,
      ehr_id: input.ehr_id,
      template_id: input.template_id,
      committed_at: input.committed_at ?? new Date().toISOString(),
      trigger_event_id: input.trigger_event_id,
      trigger_event_type: input.trigger_event_type,
      canonical_store: 'openehr',
    },
  };
}
