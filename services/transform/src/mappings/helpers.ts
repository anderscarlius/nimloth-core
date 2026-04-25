// Gemensamma hjälpare för alla mappers.

import { randomUUID } from 'node:crypto';
import type { CdcRawEvent, MapperContext } from '../types.js';

export const SU_HSA = 'SE2321000131-E000000000001';
export const VGR_HSA = 'SE2321000131-E000000000000';

export interface BaseEventFields {
  event_id: string;
  event_type: string;
  event_version: string;
  timestamp: string;
  source_system: 'melior' | 'asynja';
  source_instance: string;
  patient_id: string;
  producer_id?: string;
  pdl_context: {
    care_unit: string;
    care_provider: string;
    purpose: 'CARE';
    legal_basis: 'PDL_2_4';
  };
  correlation_id: string;
}

/**
 * Bygg BaseEvent-header. patient_id sätts från personnummer om uppslag finns,
 * annars `{source_system}:{patient_id}` som fallback.
 */
export function baseEvent(
  raw: CdcRawEvent,
  ctx: MapperContext,
  eventType: string,
  producerHsa?: string,
): BaseEventFields {
  const data = raw.after ?? raw.before ?? {};
  const rawPatientId = (data as Record<string, unknown>).patient_id as number | string | undefined;
  const personnummer =
    (data as Record<string, unknown>).personnummer as string | undefined ??
    ctx.patients.get(raw.source_system, rawPatientId ?? null);
  const patientId = personnummer ?? (rawPatientId != null ? `${raw.source_system}:${rawPatientId}` : 'unknown');

  return {
    event_id: randomUUID(),
    event_type: eventType,
    event_version: '1.0.0',
    timestamp: new Date().toISOString(),
    source_system: raw.source_system,
    source_instance: raw.source_instance,
    patient_id: patientId,
    producer_id: producerHsa,
    pdl_context: {
      care_unit: SU_HSA,
      care_provider: VGR_HSA,
      purpose: 'CARE',
      legal_basis: 'PDL_2_4',
    },
    correlation_id: randomUUID(),
  };
}
