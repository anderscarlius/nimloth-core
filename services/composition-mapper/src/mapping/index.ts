// Aggregat-funktion som kör alla sex deterministiska mappare över en
// validerad MedicationStatement och returnerar en map keyed på fältnamn.
//
// 4.5 LLM-assist-modulen plockar upp null-resultaten och försöker tolkning.
// 4.6 aggregator slår ihop deterministisk + LLM-resultat och beslutar om
// human-review-required.

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
