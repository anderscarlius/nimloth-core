import { describe, it, expect, vi } from 'vitest';
import {
  applyDeterministicMappings,
  DETERMINISTIC_FIELD_KEYS,
  mapMedicationStatement,
} from '../index.js';
import type { MedicationStatement } from '../../validation/fhir.js';
import type { LlmAssist } from '../llm-assist.js';

const fullMs: MedicationStatement = {
  resourceType: 'MedicationStatement',
  status: 'active',
  medicationCodeableConcept: {
    coding: [{ system: 'http://www.whocc.no/atc', code: 'B01AA03', display: 'Warfarin' }],
  },
  subject: { reference: 'Patient/19500315-2384' },
  effectiveDateTime: '2025-03-18T08:00:00Z',
  dosage: [
    {
      sequence: 1,
      text: '2.5 mg dagligen',
      route: {
        coding: [{ system: 'http://snomed.info/sct', code: '26643006', display: 'Oral' }],
      },
    },
  ],
};

const minimalMs: MedicationStatement = {
  resourceType: 'MedicationStatement',
  status: 'active',
  medicationCodeableConcept: {
    coding: [{ system: 'http://www.whocc.no/atc', code: 'C09AA05' }],
  },
  subject: { reference: 'Patient/abc-123' },
};

describe('applyDeterministicMappings', () => {
  it('fills all six fields for a full MedicationStatement', () => {
    const result = applyDeterministicMappings(fullMs);
    for (const key of DETERMINISTIC_FIELD_KEYS) {
      expect(result[key], `field ${key} should be mapped`).not.toBeNull();
    }
    expect(result.medicationName?.value).toEqual({
      name: 'Warfarin',
      code: 'B01AA03',
      system: 'http://www.whocc.no/atc',
    });
    expect(result.status?.value).toBe('active');
    expect(result.startTime?.value).toBe('2025-03-18T08:00:00Z');
    expect(result.sequence?.value).toBe(1);
  });

  it('returns null for unmapped fields on a minimal MedicationStatement', () => {
    const result = applyDeterministicMappings(minimalMs);
    // Required fields succeed
    expect(result.medicationName).not.toBeNull();
    expect(result.status).not.toBeNull();
    expect(result.subject).not.toBeNull();
    // Optional fields are null
    expect(result.startTime).toBeNull();
    expect(result.route).toBeNull();
    expect(result.sequence).toBeNull();
  });

  it('exposes a stable key order via DETERMINISTIC_FIELD_KEYS', () => {
    const result = applyDeterministicMappings(fullMs);
    const actualKeys = Object.keys(result);
    // All expected keys present (order in object literal is stable in modern V8)
    for (const key of DETERMINISTIC_FIELD_KEYS) {
      expect(actualKeys).toContain(key);
    }
    expect(actualKeys.length).toBe(DETERMINISTIC_FIELD_KEYS.length);
  });
});

// ============================================================
// mapMedicationStatement (P4 4.6 — full pipeline)
// ============================================================

function stubLlmAssist(over: Partial<LlmAssist> = {}): LlmAssist {
  return {
    parseDosageText: vi.fn(async () => null),
    parseDosageTiming: vi.fn(async () => null),
    inferStatus: vi.fn(async () => null),
    suggestAtc: vi.fn(async () => null),
    ...over,
  } as unknown as LlmAssist;
}

describe('mapMedicationStatement (P4 4.6)', () => {
  it('useLlm=false ger missing dose/frequency men complete på required-fält endast om threshold tillåter', async () => {
    const result = await mapMedicationStatement(fullMs, 'med-001', {}, { useLlm: false });
    // doseQuantity och frequency blir null, vilket inte är required-fält
    // Aggregator ser då bara 6 deterministiska fält med 1.0 confidence —
    // aggregateConfidence = 1.0 (min av known evidence), passes threshold.
    expect(result.status).toBe('complete');
    expect(result.composition.medicationName?.value.code).toBe('B01AA03');
    expect(result.composition.doseQuantity).toBeUndefined();
    expect(result.composition.frequency).toBeUndefined();
  });

  it('useLlm=true anropar parseDosageText + parseDosageTiming alltid', async () => {
    const llm = stubLlmAssist();
    await mapMedicationStatement(fullMs, 'med-001', { llm }, { useLlm: true });
    expect(llm.parseDosageText).toHaveBeenCalledOnce();
    expect(llm.parseDosageTiming).toHaveBeenCalledOnce();
  });

  it('useLlm=true anropar INTE inferStatus när deterministic.status finns', async () => {
    const llm = stubLlmAssist();
    await mapMedicationStatement(fullMs, 'med-001', { llm }, { useLlm: true });
    expect(llm.inferStatus).not.toHaveBeenCalled();
  });

  it('useLlm=true anropar inferStatus när deterministic.status är null', async () => {
    const llm = stubLlmAssist();
    const errorMs: MedicationStatement = { ...fullMs, status: 'entered-in-error' };
    await mapMedicationStatement(errorMs, 'med-X', { llm }, { useLlm: true });
    expect(llm.inferStatus).toHaveBeenCalledOnce();
  });

  it('useLlm=true anropar suggestAtc när medicationCodeableConcept har UNKNOWN-kod', async () => {
    const llm = stubLlmAssist();
    const unknownMs: MedicationStatement = {
      ...fullMs,
      medicationCodeableConcept: {
        coding: [{ system: 'http://www.whocc.no/atc', code: 'UNKNOWN', display: 'Mystery' }],
      },
    };
    await mapMedicationStatement(unknownMs, 'med-X', { llm }, { useLlm: true });
    expect(llm.suggestAtc).toHaveBeenCalledOnce();
  });

  it('useLlm=true anropar INTE suggestAtc för normal ATC-kod', async () => {
    const llm = stubLlmAssist();
    await mapMedicationStatement(fullMs, 'med-001', { llm }, { useLlm: true });
    expect(llm.suggestAtc).not.toHaveBeenCalled();
  });

  it('threshold=0.5 (justerad) påverkar aggregator-beslut', async () => {
    const result = await mapMedicationStatement(
      fullMs,
      'med-001',
      {},
      { useLlm: false, threshold: 0.5 },
    );
    expect(result.status).toBe('complete');
  });
});
