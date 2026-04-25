// Verifierar att alla event-scheman validerar exempelpayload:s korrekt.
// Testar både positiva (giltiga events) och negativa fall (saknade fält).

import { describe, expect, it } from 'vitest';
import { validateEvent, validators, TOPICS, allTopicNames } from '../schemas/index.js';

function baseFields(type: string): Record<string, unknown> {
  return {
    event_id: '11111111-1111-1111-1111-111111111111',
    event_type: type,
    event_version: '1.0.0',
    timestamp: '2025-03-15T07:30:00Z',
    source_system: 'melior',
    source_instance: 'melior-su',
    patient_id: '19500315-2384',
    producer_id: 'SE123456789',
    correlation_id: '22222222-2222-2222-2222-222222222222',
  };
}

describe('Topic-konstanter', () => {
  it('har alla CDC-topics', () => {
    expect(TOPICS.cdc.meliorSu).toBe('vgr.cdc.melior.su.raw');
    expect(TOPICS.cdc.asynja).toBe('vgr.cdc.asynja.raw');
  });

  it('har 11 clinical-topics', () => {
    expect(Object.keys(TOPICS.clinical)).toHaveLength(11);
  });

  it('allTopicNames() returnerar ≥ 19 topics', () => {
    const all = allTopicNames();
    expect(all.length).toBeGreaterThanOrEqual(19);
    expect(all).toContain('core.audit.access');
    expect(all).toContain('core.clinical.observation.vitals');
  });
});

describe('Vitals-schema', () => {
  it('accepterar giltigt BT-event', () => {
    const event = {
      ...baseFields(TOPICS.clinical.observationVitals),
      payload: {
        observation_type: 'BLOOD_PRESSURE',
        values: [
          { code: '271649006', display: 'Systolic BP', value: 145, unit: 'mm[Hg]' },
          { code: '271650006', display: 'Diastolic BP', value: 82, unit: 'mm[Hg]' },
        ],
        recorded_by: { hsa_id: 'SE123456789', name: 'Dr. Lindqvist', role: 'PHYSICIAN' },
        recorded_at: '2025-03-15T07:30:00Z',
        encounter_id: '42',
      },
    };
    const { ok, errors } = validateEvent('vitals', event);
    expect(errors, errors.join(', ')).toEqual([]);
    expect(ok).toBe(true);
  });

  it('avvisar event utan required payload-fält', () => {
    const event = {
      ...baseFields(TOPICS.clinical.observationVitals),
      payload: { observation_type: 'HEART_RATE' }, // saknar values, recorded_by, recorded_at
    };
    const { ok } = validateEvent('vitals', event);
    expect(ok).toBe(false);
  });

  it('avvisar ogiltigt observation_type', () => {
    const event = {
      ...baseFields(TOPICS.clinical.observationVitals),
      payload: {
        observation_type: 'FOOBAR',
        values: [{ value: 72, unit: 'bpm' }],
        recorded_by: { hsa_id: 'SE123456789' },
        recorded_at: '2025-03-15T07:30:00Z',
      },
    };
    const { ok } = validateEvent('vitals', event);
    expect(ok).toBe(false);
  });
});

describe('Lab-result-schema', () => {
  it('accepterar INR-resultat', () => {
    const event = {
      ...baseFields(TOPICS.clinical.labResult),
      payload: {
        order_id: 'SU-LAB-2025-050501',
        analysis: { system: 'http://npu.dk', code: 'NPU04206', display: 'P-INR' },
        result: { value_numeric: 2.4, unit: '', reference_low: 2.0, reference_high: 3.0 },
        lab_system_code: 'FLEXLAB-SU',
        sample_collected_at: '2025-05-05T09:00:00Z',
        result_available_at: '2025-05-05T09:45:00Z',
      },
    };
    const { ok, errors } = validateEvent('labResult', event);
    expect(errors, errors.join(', ')).toEqual([]);
    expect(ok).toBe(true);
  });
});

describe('Medication-schema', () => {
  it('accepterar Waran-prescribed', () => {
    const event = {
      ...baseFields(TOPICS.clinical.medicationPrescribed),
      payload: {
        action: 'PRESCRIBED',
        medication: { system: 'http://whocc.no/atc', code: 'B01AA03', display: 'Waran' },
        drug_name: 'Waran',
        atc_code: 'B01AA03',
        strength: '2.5 mg',
        dosage: '1x1',
        route: 'PO',
        frequency: 'DAILY',
        start_date: '2025-03-18',
        prescribed_by: { hsa_id: 'SE123456789', name: 'Dr. Lindqvist' },
        status: 'ACTIVE',
      },
    };
    const { ok, errors } = validateEvent('medication', event);
    expect(errors, errors.join(', ')).toEqual([]);
    expect(ok).toBe(true);
  });
});

describe('Procedure-schema', () => {
  it('accepterar höftprotes (NFB49)', () => {
    const event = {
      ...baseFields(TOPICS.clinical.procedureCompleted),
      payload: {
        procedure: { system: 'KVA', code: 'NFB49', display: 'Total höftprotesplastik' },
        procedure_code_kva: 'NFB49',
        procedure_name: 'Total höftprotesplastik, höger',
        laterality: 'RIGHT',
        implant: {
          type: 'CEMENTED',
          manufacturer: 'Zimmer Biomet',
          model: 'Avenir Complete',
          size: 'Size 3 stem, 52mm cup',
        },
        performer: { hsa_id: 'SE123456789', name: 'Dr. Erik Lindqvist' },
        procedure_date: '2025-03-15T08:30:00Z',
        duration_minutes: 95,
        anesthesia_type: 'SPINAL',
      },
    };
    const { ok, errors } = validateEvent('procedure', event);
    expect(errors, errors.join(', ')).toEqual([]);
    expect(ok).toBe(true);
  });
});

describe('Condition-schema', () => {
  it('accepterar koxartros-diagnos', () => {
    const event = {
      ...baseFields(TOPICS.clinical.conditionDiagnosed),
      payload: {
        diagnosis: { system: 'http://icd10.se', code: 'M16.1', display: 'Primär koxartros' },
        icd_code: 'M16.1',
        diagnosis_type: 'PRIMARY',
        diagnosed_at: '2024-03-10T10:00:00Z',
      },
    };
    const { ok, errors } = validateEvent('condition', event);
    expect(errors, errors.join(', ')).toEqual([]);
    expect(ok).toBe(true);
  });
});

describe('Allergy-schema', () => {
  it('accepterar penicillin-allergi', () => {
    const event = {
      ...baseFields(TOPICS.clinical.allergyReported),
      payload: {
        allergen: 'Penicillin',
        reaction: 'Urtikaria',
        severity: 'MODERATE',
        verified: true,
        reported_at: '2015-01-10T10:00:00Z',
      },
    };
    const { ok, errors } = validateEvent('allergy', event);
    expect(errors, errors.join(', ')).toEqual([]);
    expect(ok).toBe(true);
  });
});

describe('Encounter-schema', () => {
  it('accepterar inpatient-start', () => {
    const event = {
      ...baseFields(TOPICS.clinical.encounterStarted),
      payload: {
        action: 'STARTED',
        encounter_id: '42',
        encounter_type: 'INPATIENT',
        department_code: 'SU-ORT-AVD',
        department_name: 'Ortopedavdelning SU Mölndal',
        admission_date: '2025-03-15T07:00:00Z',
        status: 'ACTIVE',
      },
    };
    const { ok, errors } = validateEvent('encounter', event);
    expect(errors, errors.join(', ')).toEqual([]);
    expect(ok).toBe(true);
  });
});

describe('Audit-schema', () => {
  it('accepterar READ-event', () => {
    const event = {
      event_id: '33333333-3333-3333-3333-333333333333',
      timestamp: '2026-04-21T10:00:00Z',
      actor: { hsa_id: 'SE123456789', name: 'Dr. A', role: 'PHYSICIAN' },
      action: 'READ',
      resource_type: 'Patient',
      resource_id: 'Patient/1',
      patient_id: '19500315-2384',
      pdl_context: { care_unit: 'SU-AKUT', purpose: 'CARE', legal_basis: 'PDL_2_4' },
      outcome: 'SUCCESS',
    };
    const { ok, errors } = validateEvent('audit', event);
    expect(errors, errors.join(', ')).toEqual([]);
    expect(ok).toBe(true);
  });

  it('avvisar event utan outcome', () => {
    const event = {
      event_id: '44444444-4444-4444-4444-444444444444',
      timestamp: '2026-04-21T10:00:00Z',
      actor: { hsa_id: 'SE123456789' },
      action: 'READ',
      resource_type: 'Patient',
      patient_id: '19500315-2384',
    };
    const { ok } = validateEvent('audit', event);
    expect(ok).toBe(false);
  });
});

describe('Validator-fabriker finns för alla event-typer', () => {
  it('har 10 validators', () => {
    expect(Object.keys(validators)).toHaveLength(10);
  });
});
