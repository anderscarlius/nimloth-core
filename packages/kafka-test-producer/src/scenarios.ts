// Fru Andersson-scenariot som Kafka-events.
//
// Each event har:
//   - event_id (UUID)
//   - event_type (specifik vad composer event-mapper förstår)
//   - patient_pnr (Fru Andersson)
//   - source_system, occurred_at, payload
//
// Topics härleds från event_type via prefix-match. Vitals → observation.vitals
// (alla sub-events delar topic). Procedure → procedure.completed.

import { randomUUID } from 'node:crypto';

export const FRU_ANDERSSON_PNR = '19500315-2384';

export interface ClinicalEvent {
  event_id: string;
  event_type: string;
  patient_pnr: string;
  source_system: string;
  occurred_at: string;
  payload: Record<string, unknown>;
}

function now(offsetMinutes = 0): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() + offsetMinutes);
  return d.toISOString();
}

export function bodyTemperatureEvent(value: number, units = '°C', offsetMin = 0): ClinicalEvent {
  return {
    event_id: randomUUID(),
    event_type: 'core.clinical.observation.vitals.body_temperature',
    patient_pnr: FRU_ANDERSSON_PNR,
    source_system: 'kafka-test-producer',
    occurred_at: now(offsetMin),
    payload: { value, units, observation_method: 'tympanic' },
  };
}

export function bloodPressureEvent(systolic: number, _diastolic: number, offsetMin = 0): ClinicalEvent {
  // Fixture time_series.en.v1 har bara ett DV_QUANTITY-fält; vi skickar systolic
  // som primärt värde och loggar att diastolic-paret är fixture-limitation.
  return {
    event_id: randomUUID(),
    event_type: 'core.clinical.observation.vitals.blood_pressure',
    patient_pnr: FRU_ANDERSSON_PNR,
    source_system: 'kafka-test-producer',
    occurred_at: now(offsetMin),
    payload: { value: systolic, units: 'mm[Hg]', position: 'sitting' },
  };
}

export function pulseEvent(bpm: number, offsetMin = 0): ClinicalEvent {
  return {
    event_id: randomUUID(),
    event_type: 'core.clinical.observation.vitals.pulse',
    patient_pnr: FRU_ANDERSSON_PNR,
    source_system: 'kafka-test-producer',
    occurred_at: now(offsetMin),
    payload: { value: bpm, units: '/min' },
  };
}

export function procedureCompletedEvent(description: string, offsetMin = 0): ClinicalEvent {
  return {
    event_id: randomUUID(),
    event_type: 'core.clinical.procedure.completed',
    patient_pnr: FRU_ANDERSSON_PNR,
    source_system: 'kafka-test-producer',
    occurred_at: now(offsetMin),
    payload: { description },
  };
}

export function medicationPrescribedEvent(drug: string, dose: string, offsetMin = 0): ClinicalEvent {
  // P3.0b-blocker: composer mappar inte denna event-type än (gap-loggad).
  return {
    event_id: randomUUID(),
    event_type: 'core.clinical.medication.prescribed',
    patient_pnr: FRU_ANDERSSON_PNR,
    source_system: 'kafka-test-producer',
    occurred_at: now(offsetMin),
    payload: { drug, dose },
  };
}

/**
 * Fru Anderssons akutankomst: 6 events, blandning av composed (4) och gap (2).
 * Tidsstämplar offset:as så de hamnar i kronologisk ordning.
 */
export function fruAnderssonEmergencySequence(): ClinicalEvent[] {
  return [
    bodyTemperatureEvent(38.4, '°C', 0),
    bloodPressureEvent(165, 95, 1),
    pulseEvent(98, 2),
    procedureCompletedEvent('Höftledsprotes höger (akut bedömning)', 3),
    // Två gap-events för att verifiera gap-tracking
    medicationPrescribedEvent('Warfarin', '5mg', 4),
    medicationPrescribedEvent('Metoprolol', '50mg', 5),
  ];
}

/**
 * Topic-derivation. Specifika event-suffix (`.body_temperature` etc) delar topic
 * med sin parent-kategori (`observation.vitals`). Detta matchar create-topics.sh.
 */
export function deriveTopic(eventType: string): string {
  if (eventType.startsWith('core.clinical.observation.vitals.')) return 'core.clinical.observation.vitals';
  if (eventType.startsWith('core.clinical.medication.prescribed')) return 'core.clinical.medication.prescribed';
  if (eventType.startsWith('core.clinical.medication.dispensed')) return 'core.clinical.medication.dispensed';
  if (eventType.startsWith('core.clinical.allergy.reported')) return 'core.clinical.allergy.reported';
  if (eventType.startsWith('core.clinical.procedure.completed')) return 'core.clinical.procedure.completed';
  if (eventType.startsWith('core.clinical.condition.diagnosed')) return 'core.clinical.condition.diagnosed';
  // Fallback — använd event_type direkt
  return eventType;
}
