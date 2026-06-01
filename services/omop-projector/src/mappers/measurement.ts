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
  context_start_time: string | null;   // c/context/start_time/value
  event_time: string | null;           // events[at0002]/time/value — föredragen
  analyte_name: string | null;
  analyte_code: string | null;
  value_magnitude: number | null;
  value_units: string | null;
}

export interface LabMapResult {
  rows: MeasurementRow[];
  degradations: Degradation[];
}

/**
 * Råa AQL-rader → measurement-rader.
 *
 * Kolumn-ordning (KU Steg 2):
 *   [0] composition_uid              c/uid/value
 *   [1] context_start_time           c/context/start_time/value
 *   [2] event_time                   events[at0002]/time/value (POINT_EVENT.time)
 *   [3] analyte_name                 items[at0004] (DV_TEXT)
 *   [4] analyte_code                 items[at0005] (DV_CODED_TEXT/defining_code)
 *   [5] value_magnitude              items[at0006]/magnitude (DV_QUANTITY)
 *   [6] value_units                  items[at0006]/units
 *
 * Klinisk-tidpunkt: prefer event.time (POINT_EVENT.time), fall:a tillbaka på
 * composition.context.start_time. Paritet med medication-mappern:s at0006-
 * fallback från Steg 1. Aldrig commit-tid.
 */
export function mapLaboratoryTestResultRows(
  patientSourceValue: string,
  aqlRows: unknown[][],
): LabMapResult {
  const rows: MeasurementRow[] = [];
  const degradations: Degradation[] = [];

  for (const r of aqlRows) {
    const [compUid, contextStart, eventTime, analyteName, analyteCode, magnitude, units] = r as [
      string,
      string | null,
      string | null,
      string | null,
      string | null,
      number | null,
      string | null,
    ];

    // Prefer event-time (klinisk-tidpunkt) över composition-context.start_time.
    const dt =
      typeof eventTime === 'string' && eventTime.length > 0
        ? eventTime
        : typeof contextStart === 'string' && contextStart.length > 0
          ? contextStart
          : null;

    if (!compUid || !dt) {
      degradations.push({
        kind: 'missing_field',
        source_archetype: ARCHETYPE,
        source_field: 'composition_uid|event_time|context_start_time',
        source_value: null,
        reason: 'AQL returnerade tom composition_uid eller båda tids-paths — raden hoppas',
      });
      continue;
    }

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
