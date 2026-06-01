import { describe, expect, it } from 'vitest';
import { mapLaboratoryTestResultRows } from '../mappers/measurement.js';

describe('mapLaboratoryTestResultRows', () => {
  it('mappar 7-kolumn-rad till measurement med lineage (event_time prefereras)', () => {
    const aql: unknown[][] = [
      [
        'abc123::local.ehrbase.org::1',
        '2024-11-15T08:00:00Z', // context_start_time
        '2024-11-15T08:00:00Z', // event_time (POINT_EVENT.time)
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
    expect(r.degradations[0].kind).toBe('missing_target_concept');
    expect(r.degradations[0].source_value).toBe('HBA1C');
  });

  it('föredrar event_time framför context_start_time när de skiljer', () => {
    const aql: unknown[][] = [
      [
        'uid-x::local::1',
        '2024-12-01T00:00:00Z', // composition skapad senare
        '2024-11-15T08:00:00Z', // klinisk event-tid (tidigare)
        'HBA1C',
        'HBA1C',
        54,
        'mmol/mol',
      ],
    ];
    const r = mapLaboratoryTestResultRows('p1', aql);
    expect(r.rows[0].measurement_date).toBe('2024-11-15'); // event_time vinner
    expect(r.rows[0].measurement_datetime).toBe('2024-11-15T08:00:00Z');
  });

  it('fall:ar tillbaka på context_start_time när event_time saknas', () => {
    const aql: unknown[][] = [
      [
        'uid-bred::local::1',
        '2024-06-15T10:00:00Z',
        null, // event_time saknas
        'HBA1C',
        'HBA1C',
        45,
        'mmol/mol',
      ],
    ];
    const r = mapLaboratoryTestResultRows('p2', aql);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].measurement_date).toBe('2024-06-15');
  });

  it('hanterar saknad magnitude (DV_TEXT-fallback)', () => {
    const aql: unknown[][] = [
      ['uid-1::loc::1', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z', 'KvalitativResultat', null, null, null],
    ];
    const r = mapLaboratoryTestResultRows('p1', aql);
    expect(r.rows[0].value_as_number).toBeNull();
    expect(r.rows[0].measurement_source_value).toBeNull();
    expect(r.rows[0].value_source_value).toBe('KvalitativResultat');
    expect(r.degradations[0].kind).toBe('missing_field');
  });

  it('hoppar rader utan composition_uid', () => {
    const aql: unknown[][] = [[null, '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z', 'X', 'X', 1, 'mg']];
    const r = mapLaboratoryTestResultRows('p1', aql);
    expect(r.rows).toHaveLength(0);
  });

  it('hoppar rader där bägge tids-paths är null', () => {
    const aql: unknown[][] = [['uid::loc::1', null, null, 'X', 'X', 1, 'mg']];
    const r = mapLaboratoryTestResultRows('p1', aql);
    expect(r.rows).toHaveLength(0);
    expect(r.degradations[0].kind).toBe('missing_field');
  });
});
