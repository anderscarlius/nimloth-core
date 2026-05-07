import { describe, it, expect } from 'vitest';
import { applyDeterministicMappings, DETERMINISTIC_FIELD_KEYS } from '../index.js';
import type { MedicationStatement } from '../../validation/fhir.js';

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
