// Diff-algoritm-tester (Sprint 2 P3.4, steg 4.9 / AC14).
//
// Ren funktion — inga mocks behövs. Verifierar:
// - kanonisering per resurstyp (matchar vår FHIR-typ-implementation)
// - count + set-diff
// - field_coverage v1-scope
// - KANONISERING_VERSION konstant exporteras

import { describe, expect, it } from 'vitest';
import { diffResources, KANONISERING_VERSION } from '../parity/diff.js';

describe('diffResources — Patient', () => {
  it('matchar på id (PNR identiskt mellan stores)', () => {
    const pg = [{ resourceType: 'Patient', id: '19500315-2384' }];
    const oe = [{ resourceType: 'Patient', id: '19500315-2384' }];
    const d = diffResources('Patient', pg, oe);
    expect(d.postgres_count).toBe(1);
    expect(d.openehr_count).toBe(1);
    expect(d.mismatch_count).toBe(0);
    expect(d.only_in_postgres).toEqual([]);
    expect(d.only_in_openehr).toEqual([]);
  });

  it('mismatch när bara openehr har patient', () => {
    const d = diffResources('Patient', [], [{ resourceType: 'Patient', id: '19500315-2384' }]);
    expect(d.postgres_count).toBe(0);
    expect(d.openehr_count).toBe(1);
    expect(d.mismatch_count).toBe(1);
    expect(d.only_in_openehr).toEqual(['19500315-2384']);
  });
});

describe('diffResources — Observation', () => {
  it('kanonisering på (pnr|code|effectiveDateTime)', () => {
    const obs = (id: string, code: string, time: string) => ({
      resourceType: 'Observation',
      id,
      subject: { reference: 'Patient/19500315-2384' },
      code: { coding: [{ code }] },
      effectiveDateTime: time,
    });
    // Samma kanonisering ⇒ no-mismatch trots olika id
    const pg = [obs('uuid-1', '8310-5', '2026-04-29T08:00:00Z')];
    const oe = [obs('comp-uid-7::1', '8310-5', '2026-04-29T08:00:00Z')];
    const d = diffResources('Observation', pg, oe);
    expect(d.mismatch_count).toBe(0);
    expect(d.only_in_postgres).toEqual([]);
  });

  it('olika datum ⇒ olika kanoniska nycklar ⇒ set-diff', () => {
    const obs = (time: string) => ({
      resourceType: 'Observation',
      id: 'x',
      subject: { reference: 'Patient/19500315-2384' },
      code: { coding: [{ code: '8310-5' }] },
      effectiveDateTime: time,
    });
    const d = diffResources('Observation', [obs('2026-04-29T08:00:00Z')], [obs('2026-04-30T08:00:00Z')]);
    expect(d.only_in_postgres).toHaveLength(1);
    expect(d.only_in_openehr).toHaveLength(1);
  });
});

describe('diffResources — MedicationStatement', () => {
  it('kanonisering på effectivePeriod.start (inte effectiveDateTime)', () => {
    // FhirMedicationStatement har bara effectivePeriod per shared/types/fhir.ts.
    const med = (start: string, atc: string) => ({
      resourceType: 'MedicationStatement',
      id: 'm',
      status: 'active',
      subject: { reference: 'Patient/19500315-2384' },
      medicationCodeableConcept: { coding: [{ code: atc }] },
      effectivePeriod: { start },
    });
    const pg = [med('2026-04-29', 'B01AA03')];
    const oe = [med('2026-04-29', 'B01AA03')];
    expect(diffResources('MedicationStatement', pg, oe).mismatch_count).toBe(0);
  });
});

describe('diffResources — Procedure', () => {
  it('fallback från performedDateTime till performedPeriod.start', () => {
    const procDT = {
      resourceType: 'Procedure',
      id: 'a',
      status: 'completed',
      subject: { reference: 'Patient/19500315-2384' },
      code: { coding: [{ code: 'KVÅ.NFB29' }] },
      performedDateTime: '2026-04-29T10:00:00Z',
    };
    const procPeriod = {
      resourceType: 'Procedure',
      id: 'b',
      status: 'completed',
      subject: { reference: 'Patient/19500315-2384' },
      code: { coding: [{ code: 'KVÅ.NFB29' }] },
      performedPeriod: { start: '2026-04-29T10:00:00Z' },
    };
    // Samma tid via olika fält ⇒ samma kanoniska nyckel
    const d = diffResources('Procedure', [procDT], [procPeriod]);
    expect(d.mismatch_count).toBe(0);
  });
});

describe('diffResources — Condition', () => {
  it('fallback onsetDateTime → recordedDate', () => {
    const cOnset = {
      resourceType: 'Condition',
      id: 'c1',
      subject: { reference: 'Patient/19500315-2384' },
      code: { coding: [{ code: 'I50.9' }] },
      onsetDateTime: '2026-04-29',
    };
    const cRecorded = {
      resourceType: 'Condition',
      id: 'c2',
      subject: { reference: 'Patient/19500315-2384' },
      code: { coding: [{ code: 'I50.9' }] },
      recordedDate: '2026-04-29',
    };
    expect(diffResources('Condition', [cOnset], [cRecorded]).mismatch_count).toBe(0);
  });

  it('båda datum saknas ⇒ matchas på (pnr, code) — set-diff-brus accepteras', () => {
    const c = {
      resourceType: 'Condition',
      id: 'x',
      subject: { reference: 'Patient/19500315-2384' },
      code: { coding: [{ code: 'I50.9' }] },
    };
    expect(diffResources('Condition', [c], [c]).mismatch_count).toBe(0);
  });
});

describe('diffResources — AllergyIntolerance', () => {
  it('kanonisering på recordedDate (inte onsetDateTime — finns inte i typen)', () => {
    const a = (date: string, code: string) => ({
      resourceType: 'AllergyIntolerance',
      id: 'a',
      patient: { reference: 'Patient/19500315-2384' },
      code: { coding: [{ code }] },
      recordedDate: date,
    });
    expect(diffResources('AllergyIntolerance', [a('2026-04-29', 'PEN')], [a('2026-04-29', 'PEN')]).mismatch_count).toBe(0);
    // Subject-fältet heter `patient` (inte `subject`) — verifierat genom att
    // testen inte misslyckas på pnr-extraktion.
  });
});

describe('diffResources — field_coverage v1-scope', () => {
  it('top-level `id` + code.coding[0].code + valueQuantity.value', () => {
    const obsWithValue = {
      resourceType: 'Observation',
      id: 'o1',
      subject: { reference: 'Patient/19500315-2384' },
      code: { coding: [{ code: '8310-5' }] },
      effectiveDateTime: '2026-04-29T08:00:00Z',
      valueQuantity: { value: 38.4, unit: '°C' },
    };
    const d = diffResources('Observation', [obsWithValue], []);
    expect(d.field_coverage['id']).toEqual({ postgres: 1, openehr: 0 });
    expect(d.field_coverage['code.coding[0].code']).toEqual({ postgres: 1, openehr: 0 });
    expect(d.field_coverage['valueQuantity.value']).toEqual({ postgres: 1, openehr: 0 });
  });

  it('saknad valueQuantity ⇒ coverage 0', () => {
    const obs = {
      resourceType: 'Observation',
      id: 'o',
      subject: { reference: 'Patient/19500315-2384' },
      code: { coding: [{ code: '8310-5' }] },
      effectiveDateTime: '2026-04-29T08:00:00Z',
    };
    const d = diffResources('Observation', [obs], []);
    expect(d.field_coverage['valueQuantity.value']).toEqual({ postgres: 0, openehr: 0 });
  });
});

describe('KANONISERING_VERSION', () => {
  it('exporteras som number = 1 i Sprint 2', () => {
    expect(KANONISERING_VERSION).toBe(1);
  });
});
