// laboratory_test_result.v1 → omop.measurement
//
// Tolerans (per Del 0-rapport):
//   - analyte_code (lokal terminologi: HBA1C, CRE, INR, ...) lagras i
//     measurement_source_value. measurement_concept_id sätts till 0
//     (LOINC-mapping är ej i scope för Del 1).
//   - analyte_result.magnitude/units lagras i value_as_number/unit_source_value.
//   - analyte_name (DV_TEXT) bevaras i value_source_value som fallback om magnitude saknas.
//
// VIKTIGT: blood_pressure.v2 är INTE laddad — vital_signs ligger fortfarande
// i time_series.en.v1 (fixture-shape). BP-grenen kräver SDG-10 Fas 2 (separat
// scope) och flaggas i degradations-rapporten.
//
// Lineage: composition_uid + arketyp-id + transform-version stämplas per rad.
// INGEN LLM.

import type { MeasurementRow, Degradation } from '../types.js';

const ARCHETYPE = 'openEHR-EHR-OBSERVATION.laboratory_test_result.v1';

export interface LabAqlRow {
  composition_uid: string;
  event_time: string;
  analyte_name: string | null;
  analyte_code: string | null;
  value_magnitude: number | null;
  value_units: string | null;
}

export interface LabMapResult {
  rows: MeasurementRow[];
  degradations: Degradation[];
}

/** Råa AQL-rader → measurement-rader. */
export function mapLaboratoryTestResultRows(
  patientSourceValue: string,
  aqlRows: unknown[][],
): LabMapResult {
  const rows: MeasurementRow[] = [];
  const degradations: Degradation[] = [];

  for (const r of aqlRows) {
    const [compUid, eventTime, analyteName, analyteCode, magnitude, units] = r as [
      string,
      string,
      string | null,
      string | null,
      number | null,
      string | null,
    ];

    if (!compUid || !eventTime) {
      degradations.push({
        kind: 'missing_field',
        source_archetype: ARCHETYPE,
        source_field: 'composition_uid|event_time',
        source_value: null,
        reason: 'AQL returnerade tom composition_uid eller event_time — raden hoppas',
      });
      continue;
    }

    const dt = eventTime;
    const date = dt.slice(0, 10);
    const code = analyteCode?.trim() || null;
    const nameStr = analyteName?.trim() || null;

    if (code) {
      // Lokal terminologi (HBA1C/CRE/INR/...) bevaras → degradera target-concept.
      degradations.push({
        kind: 'missing_target_concept',
        source_archetype: ARCHETYPE,
        source_field: 'analyte_code',
        source_value: code,
        reason: 'Lokal analyte_code bevaras i measurement_source_value; LOINC-mapping ej i Del 1',
        composition_uid: compUid,
      });
    } else if (nameStr) {
      degradations.push({
        kind: 'missing_field',
        source_archetype: ARCHETYPE,
        source_field: 'analyte_code',
        source_value: nameStr,
        reason: 'analyte_code saknas — endast analyte_name (DV_TEXT) bevaras',
        composition_uid: compUid,
      });
    }

    rows.push({
      person_source_value: patientSourceValue,
      measurement_date: date,
      measurement_datetime: dt,
      value_as_number: typeof magnitude === 'number' ? magnitude : null,
      unit_source_value: units?.trim() || null,
      measurement_source_value: code,
      value_source_value: nameStr,
      _source_composition_uid: compUid,
      _source_archetype: ARCHETYPE,
    });
  }

  return { rows, degradations };
}
