import { describe, expect, it } from 'vitest';
import { evaluateFhirPatientRead } from '../evaluate.js';

const base = {
  has_care_relation: true,
  emergency: false,
  emergency_justification: '',
  blocked: false,
  purpose: 'CARE' as const,
  research_consent: false,
};

describe('evaluateFhirPatientRead (OPA parity)', () => {
  it('permit normal CARE read', () => {
    expect(evaluateFhirPatientRead(base).allow).toBe(true);
  });

  it('deny without care relation', () => {
    const r = evaluateFhirPatientRead({ ...base, has_care_relation: false });
    expect(r.allow).toBe(false);
    expect(r.reason).toBe('NO_CARE_RELATION');
  });

  it('deny blocked patient', () => {
    const r = evaluateFhirPatientRead({ ...base, blocked: true });
    expect(r.allow).toBe(false);
    expect(r.reason).toBe('PATIENT_BLOCKED');
  });

  it('deny RESEARCH without consent', () => {
    const r = evaluateFhirPatientRead({
      ...base,
      purpose: 'RESEARCH',
      research_consent: false,
    });
    expect(r.allow).toBe(false);
    expect(r.reason).toBe('RESEARCH_CONSENT_DENIED');
  });

  it('permit RESEARCH with consent', () => {
    const r = evaluateFhirPatientRead({
      ...base,
      purpose: 'RESEARCH',
      research_consent: true,
    });
    expect(r.allow).toBe(true);
  });

  it('permit emergency with justification (even if blocked)', () => {
    const r = evaluateFhirPatientRead({
      ...base,
      has_care_relation: false,
      blocked: true,
      emergency: true,
      emergency_justification: 'Akut livshotande tillstånd på akuten',
    });
    expect(r.allow).toBe(true);
  });

  it('deny emergency without justification', () => {
    const r = evaluateFhirPatientRead({
      ...base,
      emergency: true,
      emergency_justification: '   ',
    });
    expect(r.allow).toBe(false);
    expect(r.reason).toBe('EMERGENCY_JUSTIFICATION_REQUIRED');
  });
});
