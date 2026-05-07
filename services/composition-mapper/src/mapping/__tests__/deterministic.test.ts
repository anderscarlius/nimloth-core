import { describe, it, expect } from 'vitest';
import {
  mapMedicationName,
  mapStatus,
  mapStartTime,
  mapRoute,
  mapSequence,
  mapSubject,
} from '../deterministic.js';
import type { MedicationStatement, MedicationStatementStatusValue } from '../../validation/fhir.js';

const baseMs = (): MedicationStatement => ({
  resourceType: 'MedicationStatement',
  status: 'active',
  medicationCodeableConcept: {
    coding: [{ system: 'http://www.whocc.no/atc', code: 'B01AA03', display: 'Warfarin' }],
  },
  subject: { reference: 'Patient/19500315-2384' },
});

// ----- mapMedicationName -----

describe('mapMedicationName', () => {
  it('maps coding[0] with display + code + system', () => {
    const result = mapMedicationName(baseMs());
    expect(result).toEqual({
      value: { name: 'Warfarin', code: 'B01AA03', system: 'http://www.whocc.no/atc' },
      confidence: 1.0,
    });
  });

  it('falls back to code when display is missing', () => {
    const ms = baseMs();
    ms.medicationCodeableConcept.coding[0] = {
      system: 'http://www.whocc.no/atc',
      code: 'C09AA05',
    };
    const result = mapMedicationName(ms);
    expect(result?.value.name).toBe('C09AA05');
    expect(result?.value.code).toBe('C09AA05');
  });

  it('returns null when coding[0] is undefined (defensive — Zod normally rejects)', () => {
    // Skapas via tom array (Zod-validering skulle stoppa, men deterministic
    // ska inte krascha om någon caller skippar validering)
    const ms = { ...baseMs(), medicationCodeableConcept: { coding: [] } } as MedicationStatement;
    expect(mapMedicationName(ms)).toBeNull();
  });
});

// ----- mapStatus -----

describe('mapStatus', () => {
  const cases: Array<[MedicationStatementStatusValue, string | null]> = [
    ['active', 'active'],
    ['completed', 'completed'],
    ['stopped', 'abandoned'],
    ['on-hold', 'suspended'],
    ['intended', 'planned'],
    ['entered-in-error', null],
    ['not-taken', null],
    ['unknown', null],
  ];

  it.each(cases)('maps FHIR status %s → openEHR %s', (status, expected) => {
    const ms = baseMs();
    ms.status = status;
    const result = mapStatus(ms);
    if (expected === null) {
      expect(result).toBeNull();
    } else {
      expect(result?.value).toBe(expected);
      expect(result?.confidence).toBe(1.0);
    }
  });
});

// ----- mapStartTime -----

describe('mapStartTime', () => {
  it('prefers effectiveDateTime when present', () => {
    const ms = baseMs();
    ms.effectiveDateTime = '2025-03-18T08:00:00Z';
    ms.effectivePeriod = { start: '2024-01-01' };
    const result = mapStartTime(ms);
    expect(result?.value).toBe('2025-03-18T08:00:00Z');
  });

  it('falls back to effectivePeriod.start', () => {
    const ms = baseMs();
    ms.effectivePeriod = { start: '2025-03-18' };
    const result = mapStartTime(ms);
    expect(result?.value).toBe('2025-03-18');
  });

  it('returns null when neither field is present', () => {
    const result = mapStartTime(baseMs());
    expect(result).toBeNull();
  });
});

// ----- mapRoute -----

describe('mapRoute', () => {
  const withRoute = (): MedicationStatement => ({
    ...baseMs(),
    dosage: [
      {
        route: {
          coding: [{ system: 'http://snomed.info/sct', code: '26643006', display: 'Oral' }],
        },
      },
    ],
  });

  it('maps dosage[0].route.coding[0]', () => {
    const result = mapRoute(withRoute());
    expect(result).toEqual({
      value: { value: 'Oral', terminology: 'http://snomed.info/sct', code: '26643006' },
      confidence: 1.0,
    });
  });

  it('falls back to code when display is missing', () => {
    const ms = withRoute();
    ms.dosage![0]!.route!.coding[0] = { system: 'http://snomed.info/sct', code: '26643006' };
    const result = mapRoute(ms);
    expect(result?.value.value).toBe('26643006');
  });

  it('returns null when dosage is missing', () => {
    expect(mapRoute(baseMs())).toBeNull();
  });

  it('returns null when route is missing on dosage[0]', () => {
    const ms = baseMs();
    ms.dosage = [{ text: 'fritext utan route' }];
    expect(mapRoute(ms)).toBeNull();
  });

  it('returns null when route.coding[0] is undefined (defensive — Zod normally rejects)', () => {
    const ms = baseMs();
    // Bypass typkontroll för defensiv test — Zod skulle ha avvisat detta.
    ms.dosage = [{ route: { coding: [] as unknown as [typeof ms.medicationCodeableConcept.coding[0]] } }];
    expect(mapRoute(ms)).toBeNull();
  });
});

// ----- mapSequence -----

describe('mapSequence', () => {
  it('maps dosage[0].sequence', () => {
    const ms = baseMs();
    ms.dosage = [{ sequence: 2 }];
    const result = mapSequence(ms);
    expect(result?.value).toBe(2);
    expect(result?.confidence).toBe(1.0);
  });

  it('returns null when dosage is missing', () => {
    expect(mapSequence(baseMs())).toBeNull();
  });

  it('returns null when sequence is missing on dosage[0]', () => {
    const ms = baseMs();
    ms.dosage = [{ text: 'no sequence' }];
    expect(mapSequence(ms)).toBeNull();
  });
});

// ----- mapSubject -----

describe('mapSubject', () => {
  it('extracts id from Patient/{id} reference', () => {
    const result = mapSubject(baseMs());
    expect(result).toEqual({
      value: { namespace: 'patient', type: 'PERSON', id: '19500315-2384' },
      confidence: 1.0,
    });
  });

  it('returns null on malformed reference (defensive — validation should catch)', () => {
    const ms = baseMs();
    ms.subject.reference = 'Patient/';
    const result = mapSubject(ms);
    expect(result).toBeNull();
  });
});
