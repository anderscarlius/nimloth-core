import { describe, expect, it } from 'vitest';
import { mapMedicationSummaryRows } from '../mappers/medication.js';

describe('mapMedicationSummaryRows', () => {
  it('mappar fyra kolumner per rad → drug_exposure med lineage', () => {
    const aql: unknown[][] = [
      [
        'e108fe9f-dbe8-491f-8aa1-b8132eb4aaf0::local.ehrbase.org::1',
        '2024-11-15T08:00:00Z',
        'Metformin 500 mg x 2 (T2D, sedan 2018)',
        'A10BA02',
      ],
      [
        '2729752d-cc85-4937-b099-5b07b77f77bc::local.ehrbase.org::1',
        '2025-03-18T08:00:00Z',
        'Warfarin (Waran) 2.5 mg x 1, antikoagulation',
        'B01AA03',
      ],
    ];
    const r = mapMedicationSummaryRows('ingrid-andersson-syn-001', aql);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({
      person_source_value: 'ingrid-andersson-syn-001',
      drug_exposure_start_date: '2024-11-15',
      drug_exposure_start_datetime: '2024-11-15T08:00:00Z',
      drug_source_value: 'A10BA02',
      sig: 'Metformin 500 mg x 2 (T2D, sedan 2018)',
      _source_composition_uid: 'e108fe9f-dbe8-491f-8aa1-b8132eb4aaf0::local.ehrbase.org::1',
      _source_archetype: 'openEHR-EHR-EVALUATION.medication_summary.v1',
    });
    // ATC bevaras men RxNorm-mapping saknas → "missing_target_concept"
    expect(r.degradations.every((d) => d.kind === 'missing_target_concept')).toBe(true);
    expect(r.degradations).toHaveLength(2);
  });

  it('hoppar rader utan composition_uid/start_time', () => {
    const aql: unknown[][] = [['', '2024-01-01T00:00:00Z', 'X', 'X']];
    const r = mapMedicationSummaryRows('p1', aql);
    expect(r.rows).toHaveLength(0);
    expect(r.degradations[0].kind).toBe('missing_field');
  });

  it('flaggar saknad ATC men bevarar fri-text', () => {
    const aql: unknown[][] = [
      ['uid-1::loc::1', '2024-01-01T00:00:00Z', 'Endast fri-text dose 5 mg', null],
    ];
    const r = mapMedicationSummaryRows('p1', aql);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].drug_source_value).toBeNull();
    expect(r.rows[0].sig).toBe('Endast fri-text dose 5 mg');
    expect(r.degradations[0].kind).toBe('missing_field');
    expect(r.degradations[0].source_field).toBe('atc_code');
  });
});
