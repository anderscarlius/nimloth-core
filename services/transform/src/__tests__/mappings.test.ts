// Mapper-tester — verifierar att varje mappning producerar rätt output
// för realistiska CDC-raw-events (format matchar det ingest-tjänsten publicerar).

import { describe, expect, it } from 'vitest';
import pino from 'pino';
import { PatientCache } from '../patient-cache.js';
import { DqdMetrics } from '../quality.js';
import type { CdcRawEvent, MapperContext, MapperResult } from '../types.js';
import {
  mapVitals,
  mapLabResult,
  mapMedication,
  mapProcedure,
  mapEncounter,
  mapCondition,
  mapAllergy,
} from '../mappings/index.js';

const logger = pino({ level: 'silent' });

function ctx(): MapperContext {
  const patients = new PatientCache();
  patients.upsert('melior', 1, '19500315-2384');
  return { instanceId: 'su', patients, metrics: new DqdMetrics(), logger };
}

function unwrap(r: MapperResult | MapperResult[] | null): {
  topic: string;
  event: Record<string, unknown>;
  payload: Record<string, unknown>;
} {
  if (r == null) throw new Error('expected result, got null');
  const first = Array.isArray(r) ? r[0] : r;
  return {
    topic: first.topic,
    event: first.event,
    payload: first.event.payload as Record<string, unknown>,
  };
}

function raw(table: string, after: Record<string, unknown>, op: CdcRawEvent['operation'] = 'INSERT'): CdcRawEvent {
  return {
    source_system: 'melior',
    source_instance: 'melior-su',
    source_table: table,
    operation: op,
    timestamp: '2025-03-15T07:30:00.000Z',
    before: op === 'DELETE' ? after : null,
    after: op === 'DELETE' ? null : after,
    metadata: { transaction_id: '123', lsn: '456' },
  };
}

describe('Vitals', () => {
  it('mappar BT till dubbla Snomed-component-values', () => {
    const r = mapVitals(
      raw('observations', {
        patient_id: 1,
        encounter_id: 42,
        observation_type: 'BLOOD_PRESSURE',
        value_numeric: 145,
        value_numeric2: 82,
        unit: 'mmHg',
        recorded_by_hsa: 'SE123456789',
        recorded_at: 1742025000000,
      }),
      ctx(),
    );
    expect(r).not.toBeNull();
    const ev = unwrap(r);
    expect(ev.topic).toBe('core.clinical.observation.vitals');
    const values = ev.payload.values as Array<{ code: string; value: number; unit: string }>;
    expect(values).toHaveLength(2);
    expect(values[0].code).toBe('271649006'); // systolic
    expect(values[0].value).toBe(145);
    expect(values[0].unit).toBe('mm[Hg]');
    expect(values[1].code).toBe('271650006'); // diastolic
    expect(values[1].value).toBe(82);
    expect(ev.event.patient_id).toBe('19500315-2384');
  });

  it('flaggar avsaknad av diastoliskt BT', () => {
    const r = mapVitals(
      raw('observations', {
        patient_id: 1,
        observation_type: 'BLOOD_PRESSURE',
        value_numeric: 145,
        unit: 'mmHg',
        recorded_at: 1742025000000,
      }),
      ctx(),
    );
    const ev = unwrap(r);
    expect(ev.payload.quality_flags).toContain('MISSING_DIASTOLIC');
  });

  it('returnerar null vid DELETE', () => {
    const r = mapVitals(raw('observations', { patient_id: 1 }, 'DELETE'), ctx());
    expect(r).toBeNull();
  });
});

describe('Lab result', () => {
  it('mappar NPU-kod till LOINC', () => {
    const r = mapLabResult(
      raw('lab_results', {
        patient_id: 1,
        analysis_code: 'NPU04206',
        analysis_name: 'P-INR',
        value_numeric: 2.4,
        unit: '',
        reference_low: 2.0,
        reference_high: 3.0,
        lab_system_code: 'FLEXLAB-SU',
        sample_collected_at: 1746435600000,
        result_available_at: 1746438300000,
      }),
      ctx(),
    );
    const ev = unwrap(r);
    const analysis = ev.payload.analysis as { system: string; code: string };
    expect(analysis.system).toBe('http://loinc.org');
    expect(analysis.code).toBe('6301-6');
    const result = ev.payload.result as { value_numeric: number; reference_low: number };
    expect(result.value_numeric).toBe(2.4);
    expect(result.reference_low).toBe(2.0);
  });

  it('flaggar okänd NPU-kod', () => {
    const c = ctx();
    mapLabResult(
      raw('lab_results', {
        patient_id: 1,
        analysis_code: 'NPU_UNKNOWN',
        value_numeric: 1,
      }),
      c,
    );
    expect(c.metrics.flagsByType.get('UNKNOWN_CODE')).toBeGreaterThanOrEqual(1);
  });
});

describe('Medication', () => {
  it('mappar Waran med ATC-kod och datum', () => {
    const r = mapMedication(
      raw('prescriptions', {
        patient_id: 1,
        drug_name: 'Waran',
        atc_code: 'B01AA03',
        strength: '2.5 mg',
        dosage: '1x1',
        route: 'PO',
        frequency: 'DAILY',
        start_date: 20169, // ms-format hanteras också av dateToIso
        prescribing_doctor_hsa: 'SE123456789',
        status: 'ACTIVE',
      }),
      ctx(),
    );
    const ev = unwrap(r);
    const med = ev.payload.medication as { system: string; code: string };
    expect(med.system).toBe('http://whocc.no/atc');
    expect(med.code).toBe('B01AA03');
    expect(ev.payload.status).toBe('ACTIVE');
    expect(typeof ev.payload.start_date).toBe('string');
  });
});

describe('Procedure', () => {
  it('mappar NFB49 till Snomed + bevarar implantatdata', () => {
    const r = mapProcedure(
      raw('procedures', {
        patient_id: 1,
        procedure_code_kva: 'NFB49',
        procedure_name: 'Total höftprotesplastik, höger',
        laterality: 'RIGHT',
        implant_type: 'CEMENTED',
        implant_manufacturer: 'Zimmer Biomet',
        implant_model: 'Avenir Complete',
        implant_size: 'Size 3 stem, 52mm cup',
        performing_surgeon_hsa: 'SE123456789',
        performing_surgeon_name: 'Dr. Erik Lindqvist',
        procedure_date: 1742025000000,
        duration_minutes: 95,
        anesthesia_type: 'SPINAL',
      }),
      ctx(),
    );
    const ev = unwrap(r);
    const proc = ev.payload.procedure as { system: string; code: string };
    expect(proc.system).toBe('http://snomed.info/sct');
    expect(proc.code).toBe('52734007');
    const implant = ev.payload.implant as { manufacturer: string; model: string };
    expect(implant.manufacturer).toBe('Zimmer Biomet');
    expect(implant.model).toBe('Avenir Complete');
    expect(ev.payload.laterality).toBe('RIGHT');
  });
});

describe('Encounter', () => {
  it('producerar encounter.started för INSERT', () => {
    const r = mapEncounter(
      raw('encounters', {
        patient_id: 1,
        encounter_id: 42,
        encounter_type: 'INPATIENT',
        department_code: 'SU-ORT-AVD',
        department_name: 'Ortopedavdelning SU Mölndal',
        admission_date: 1742025000000,
        admitting_doctor_hsa: 'SE123456789',
        admitting_doctor_name: 'Dr. Erik Lindqvist',
        status: 'ACTIVE',
      }),
      ctx(),
    );
    const ev = unwrap(r);
    expect(ev.topic).toBe('core.clinical.encounter.started');
    expect(ev.payload.action).toBe('STARTED');
  });

  it('producerar encounter.ended för UPDATE med discharge_date', () => {
    const r = mapEncounter(
      raw(
        'encounters',
        {
          patient_id: 1,
          encounter_id: 42,
          encounter_type: 'INPATIENT',
          department_code: 'SU-ORT-AVD',
          admission_date: 1742025000000,
          discharge_date: 1742889600000,
          status: 'DISCHARGED',
        },
        'UPDATE',
      ),
      ctx(),
    );
    const ev = unwrap(r);
    expect(ev.topic).toBe('core.clinical.encounter.ended');
    expect(ev.payload.action).toBe('ENDED');
  });
});

describe('Condition', () => {
  it('mappar ICD-10 koxartros med diagnosis_type', () => {
    const r = mapCondition(
      raw('diagnoses', {
        patient_id: 1,
        encounter_id: 10,
        icd_code: 'M16.1',
        diagnosis_text: 'Primär koxartros, höger',
        diagnosis_type: 'PRIMARY',
        diagnosed_at: 1710049200000,
      }),
      ctx(),
    );
    const ev = unwrap(r);
    const diag = ev.payload.diagnosis as { system: string; code: string };
    expect(diag.system).toBe('http://hl7.org/fhir/sid/icd-10-se');
    expect(diag.code).toBe('M16.1');
    expect(ev.payload.diagnosis_type).toBe('PRIMARY');
    const typeSnomed = ev.payload.diagnosis_type_snomed as { code: string } | undefined;
    expect(typeSnomed?.code).toBe('63161005');
  });
});

describe('Allergy', () => {
  it('mappar Penicillin till Snomed CT', () => {
    const r = mapAllergy(
      raw('allergies', {
        patient_id: 1,
        allergen: 'Penicillin',
        reaction: 'Urtikaria',
        severity: 'MODERATE',
        verified: true,
        reported_by_hsa: 'SE555444333',
        reported_at: 1420884000000,
      }),
      ctx(),
    );
    const ev = unwrap(r);
    expect(ev.payload.allergen).toBe('Penicillin');
    expect(ev.payload.severity).toBe('MODERATE');
    const coded = ev.payload.allergen_coded as { code: string };
    expect(coded.code).toBe('373270004');
  });
});
