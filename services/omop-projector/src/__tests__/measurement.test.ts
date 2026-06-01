import { describe, expect, it } from 'vitest';
import { mapLaboratoryTestResultRows } from '../mappers/measurement.js';

describe('mapLaboratoryTestResultRows', () => {
  it('mappar HBA1C-rad till measurement med korrekt magnitude/units + lineage', () => {
    const aql: unknown[][] = [
      [
        'abc123::local.ehrbase.org::1',
        '2024-11-15T08:00:00Z',
        'HBA1C',
        'HBA1C',
        54.0,
        'mmol/mol',
      ],
    ];
    const r = mapLaboratoryTestResultRows('ingrid-andersson-syn-001', aql);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({
      person_source_value: 'ingrid-andersson-syn-001',
      measurement_date: '2024-11-15',
      measurement_datetime: '2024-11-15T08:00:00Z',
      value_as_number: 54.0,
      unit_source_value: 'mmol/mol',
      measurement_source_value: 'HBA1C',
      value_source_value: 'HBA1C',
      _source_archetype: 'openEHR-EHR-OBSERVATION.laboratory_test_result.v1',
    });
    // Lokal kod bevaras men LOINC saknas → "missing_target_concept"
    expect(r.degradations[0].kind).toBe('missing_target_concept');
    expect(r.degradations[0].source_value).toBe('HBA1C');
  });

  it('hanterar saknad magnitude (DV_TEXT-fallback)', () => {
    const aql: unknown[][] = [
      ['uid-1::loc::1', '2024-01-01T00:00:00Z', 'KvalitativResultat', null, null, null],
    ];
    const r = mapLaboratoryTestResultRows('p1', aql);
    expect(r.rows[0].value_as_number).toBeNull();
    expect(r.rows[0].measurement_source_value).toBeNull();
    expect(r.rows[0].value_source_value).toBe('KvalitativResultat');
    expect(r.degradations[0].kind).toBe('missing_field');
  });

  it('hoppar rader utan composition_uid', () => {
    const aql: unknown[][] = [[null, '2024-01-01T00:00:00Z', 'X', 'X', 1, 'mg']];
    const r = mapLaboratoryTestResultRows('p1', aql);
    expect(r.rows).toHaveLength(0);
  });
});
