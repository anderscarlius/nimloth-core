// OMOP CDM v5.4 — minimala radtyper för Del 1.
// Endast kolumner vi faktiskt fyller från AQL-svar. Övriga använder DB-defaults.

export interface PersonRow {
  person_source_value: string;       // patient-id (t.ex. ingrid-andersson-syn-001)
  _ehr_id: string | null;            // EHRbase EHR-UID
}

export interface DrugExposureRow {
  person_source_value: string;
  drug_exposure_start_date: string;  // ISO date (YYYY-MM-DD)
  drug_exposure_start_datetime: string; // ISO datetime
  drug_source_value: string | null;  // ATC-kod (degradering — RxNorm saknas)
  sig: string | null;                // dosering / fri text
  _source_composition_uid: string;
  _source_archetype: string;
}

export interface MeasurementRow {
  person_source_value: string;
  measurement_date: string;          // ISO date
  measurement_datetime: string;      // ISO datetime
  value_as_number: number | null;
  unit_source_value: string | null;
  measurement_source_value: string | null; // analyte_code (degradering — LOINC saknas)
  value_source_value: string | null; // analyte_name (fri text)
  _source_composition_uid: string;
  _source_archetype: string;
}

export interface Degradation {
  kind: 'missing_target_concept' | 'missing_field';
  source_archetype: string;
  source_field: string;
  source_value: string | null;
  reason: string;
  composition_uid?: string;
}

export interface ProjectionReport {
  patient_source_value: string;
  ehr_id: string | null;
  drug_exposure_rows: number;
  measurement_rows: number;
  lineage_coverage: {
    drug_exposure_with_uid: number;
    measurement_with_uid: number;
    total_uids_seen: number;
  };
  degradations: Degradation[];
  transform_version: string;
  unsupported_sources: Array<{ archetype: string; count: number; reason: string }>;
}
