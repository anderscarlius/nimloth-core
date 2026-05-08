// Field-accuracy-beräkning för eval-runner (P4 4.8).
// Pure functions. Jämför composition-mapper:s faktiska output med
// eval-set:s expected_fields per fält.

import type { ExpectedFields } from '../types/review.js';

/**
 * Deep-equal som inte beror på field-ordning eller objekt-identitet.
 * Hanterar primitiver, arrays, plain objects, null/undefined. Tillräckligt
 * för ExpectedFields-jämförelse — inte general-purpose.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a == null && b == null;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const aKeys = Object.keys(ao);
  const bKeys = Object.keys(bo);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((k) => deepEqual(ao[k], bo[k]));
}

export interface FieldAccuracyResult {
  correct: number;
  total: number;
  accuracy: number; // 0..1
  perField: Record<string, boolean>;
}

/**
 * Räkna match per fält. Hoppa över fält där expected är null (det är
 * inte en mätbar mappning, bara markering att fältet inte tillämpas).
 *
 * Composition-mapper:s output kan ha fältet undefined (om null-värdet
 * inte fyllde i sin plats i `composition`); det räknas som match med
 * expected: null.
 */
export function computeFieldAccuracy(
  actual: Partial<ExpectedFields>,
  expected: ExpectedFields,
): FieldAccuracyResult {
  const perField: Record<string, boolean> = {};
  let correct = 0;
  let total = 0;

  for (const [field, expectedValue] of Object.entries(expected)) {
    if (expectedValue === null) {
      // Skippa null-fält i expected — de räknas inte mot accuracy.
      continue;
    }
    total++;
    const actualValue = actual[field as keyof ExpectedFields];
    const isMatch = deepEqual(actualValue, expectedValue);
    perField[field] = isMatch;
    if (isMatch) correct++;
  }

  const accuracy = total === 0 ? 0 : correct / total;
  return { correct, total, accuracy, perField };
}
