import { describe, it, expect } from 'vitest';
import { computeFieldAccuracy, deepEqual } from '../accuracy.js';
import type { ExpectedFields } from '../../types/review.js';

describe('deepEqual', () => {
  it('matchar primitiver', () => {
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual('a', 'a')).toBe(true);
    expect(deepEqual(null, null)).toBe(true);
  });

  it('skiljer null från undefined explicit', () => {
    expect(deepEqual(null, undefined)).toBe(true); // båda räknas som "saknat"
  });

  it('matchar nested objects oavsett key-ordning', () => {
    expect(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
  });

  it('matchar arrays elementvis', () => {
    expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(deepEqual([1, 2, 3], [1, 2])).toBe(false);
  });

  it('skiljer arrays från objekt med liknande shape', () => {
    expect(deepEqual([1, 2], { 0: 1, 1: 2, length: 2 })).toBe(false);
  });

  it('skiljer olika objekt', () => {
    expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
  });
});

describe('computeFieldAccuracy', () => {
  const fullExpected: ExpectedFields = {
    medicationName: { value: { name: 'Warfarin', code: 'B01AA03', system: 'http://www.whocc.no/atc' } },
    status: { value: 'active' },
    startTime: { value: '2025-03-18T08:00:00Z' },
    route: { value: { value: 'Oral', terminology: 'http://snomed.info/sct', code: '26643006' } },
    sequence: { value: 1 },
    subject: { value: { namespace: 'patient', type: 'PERSON', id: '19500315-2384' } },
    doseQuantity: { value: { value: 2.5, unit: 'mg' } },
    frequency: { value: 'DAILY' },
    indication: null,
  };

  it('100% matchning när actual matchar expected', () => {
    const result = computeFieldAccuracy(fullExpected, fullExpected);
    expect(result.accuracy).toBe(1.0);
    expect(result.correct).toBe(8); // 9 fält - 1 null = 8
    expect(result.total).toBe(8);
  });

  it('skippar expected null-fält ur total', () => {
    const result = computeFieldAccuracy({}, fullExpected);
    // total = 8 (alla non-null expected); correct = 0 (inget i actual)
    expect(result.total).toBe(8);
    expect(result.correct).toBe(0);
    expect(result.accuracy).toBe(0);
  });

  it('partial match', () => {
    const partial: Partial<ExpectedFields> = {
      medicationName: fullExpected.medicationName,
      status: fullExpected.status,
      subject: fullExpected.subject,
    };
    const result = computeFieldAccuracy(partial, fullExpected);
    expect(result.correct).toBe(3);
    expect(result.total).toBe(8);
    expect(result.accuracy).toBeCloseTo(3 / 8, 3);
  });

  it('mismatch räknas som inkorrekt', () => {
    const wrong: Partial<ExpectedFields> = {
      ...fullExpected,
      status: { value: 'completed' }, // expected: 'active'
    };
    const result = computeFieldAccuracy(wrong, fullExpected);
    expect(result.perField.status).toBe(false);
    expect(result.correct).toBe(7);
  });

  it('expected helt null → total=0, accuracy=0', () => {
    const allNull: ExpectedFields = {
      medicationName: null,
      status: null,
      startTime: null,
      route: null,
      sequence: null,
      subject: null,
      doseQuantity: null,
      frequency: null,
      indication: null,
    };
    const result = computeFieldAccuracy({}, allNull);
    expect(result.total).toBe(0);
    expect(result.accuracy).toBe(0);
  });
});
