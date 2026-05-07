import { describe, it, expect } from 'vitest';
import {
  validateMedicationStatement,
  formatValidationErrors,
  MedicationStatementStatus,
} from '../fhir.js';

const minimalValid = {
  resourceType: 'MedicationStatement',
  status: 'active',
  medicationCodeableConcept: {
    coding: [{ system: 'http://www.whocc.no/atc', code: 'B01AA03', display: 'Warfarin' }],
  },
  subject: { reference: 'Patient/19500315-2384' },
};

describe('validateMedicationStatement', () => {
  it('accepts minimal valid MedicationStatement', () => {
    const result = validateMedicationStatement(minimalValid);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('active');
      expect(result.value.medicationCodeableConcept.coding[0]?.code).toBe('B01AA03');
    }
  });

  it('rejects when status is missing', () => {
    const { status: _omit, ...withoutStatus } = minimalValid;
    const result = validateMedicationStatement(withoutStatus);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const paths = result.errors.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('status');
    }
  });

  it('rejects unknown status enum', () => {
    const result = validateMedicationStatement({ ...minimalValid, status: 'frobnicated' });
    expect(result.ok).toBe(false);
  });

  it('accepts all eight FHIR R4 status values', () => {
    for (const status of MedicationStatementStatus.options) {
      const result = validateMedicationStatement({ ...minimalValid, status });
      expect(result.ok, `status=${status}`).toBe(true);
    }
  });

  it('rejects when medicationCodeableConcept.coding[] is empty', () => {
    const result = validateMedicationStatement({
      ...minimalValid,
      medicationCodeableConcept: { coding: [] },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const paths = result.errors.issues.map((i) => i.path.join('.'));
      expect(paths.some((p) => p.startsWith('medicationCodeableConcept.coding'))).toBe(true);
    }
  });

  it('rejects when subject.reference has wrong format', () => {
    const result = validateMedicationStatement({
      ...minimalValid,
      subject: { reference: 'NotAPatient/123' },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const paths = result.errors.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('subject.reference');
    }
  });

  it('accepts effectiveDateTime', () => {
    const result = validateMedicationStatement({
      ...minimalValid,
      effectiveDateTime: '2025-03-18T08:00:00Z',
    });
    expect(result.ok).toBe(true);
  });

  it('accepts effectivePeriod.start as alternative to effectiveDateTime', () => {
    const result = validateMedicationStatement({
      ...minimalValid,
      effectivePeriod: { start: '2025-03-18' },
    });
    expect(result.ok).toBe(true);
  });

  it('passes through unknown top-level fields (forward-compat)', () => {
    const result = validateMedicationStatement({
      ...minimalValid,
      _experimental: { someFutureField: 42 },
      meta: { versionId: '7' },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Top-level passthrough preserves the field
      expect((result.value as Record<string, unknown>).meta).toBeDefined();
    }
  });

  it('accepts dosage with text + route + sequence + doseAndRate', () => {
    const result = validateMedicationStatement({
      ...minimalValid,
      dosage: [
        {
          sequence: 1,
          text: '2.5 mg dagligen',
          route: {
            coding: [{ system: 'http://snomed.info/sct', code: '26643006', display: 'Oral' }],
          },
          doseAndRate: [{ doseQuantity: { value: 2.5, unit: 'mg' } }],
        },
      ],
    });
    expect(result.ok).toBe(true);
  });

  it('rejects coding entry missing system or code', () => {
    const result = validateMedicationStatement({
      ...minimalValid,
      medicationCodeableConcept: {
        coding: [{ display: 'Warfarin without system or code' }],
      },
    });
    expect(result.ok).toBe(false);
  });

  it('rejects wrong resourceType', () => {
    const result = validateMedicationStatement({
      ...minimalValid,
      resourceType: 'Observation',
    });
    expect(result.ok).toBe(false);
  });
});

describe('formatValidationErrors', () => {
  it('returns path + message tuples for HTTP-400 bodies', () => {
    const result = validateMedicationStatement({ resourceType: 'MedicationStatement' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const formatted = formatValidationErrors(result.errors);
      expect(formatted.length).toBeGreaterThan(0);
      for (const entry of formatted) {
        expect(entry).toHaveProperty('path');
        expect(entry).toHaveProperty('message');
        expect(typeof entry.path).toBe('string');
        expect(typeof entry.message).toBe('string');
      }
    }
  });

  it('renders <root> for top-level errors with empty path', () => {
    const result = validateMedicationStatement('not even an object');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const formatted = formatValidationErrors(result.errors);
      expect(formatted.some((e) => e.path === '<root>')).toBe(true);
    }
  });
});
