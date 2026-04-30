// Parity-modulens delade typer (Sprint 2 P3.4).
//
// Varför separat fil: runner, diff, recorder, audit delar shape-types.
// Att duplicera dem i varje modul leder till divergens; types.ts låser
// kontraktet en gång.

/** De 6 FHIR-resurstyper P3.4 mäter paritet på.
 *  Måste matcha CHECK-constraint i parity_snapshots-tabellen exakt. */
export type ResourceType =
  | 'Patient'
  | 'Observation'
  | 'MedicationStatement'
  | 'Procedure'
  | 'Condition'
  | 'AllergyIntolerance';

export const RESOURCE_TYPES: readonly ResourceType[] = [
  'Patient',
  'Observation',
  'MedicationStatement',
  'Procedure',
  'Condition',
  'AllergyIntolerance',
] as const;

/** Vad som triggade en run. Måste matcha CHECK-constraint. */
export type ParityTrigger = 'manual' | 'scheduled' | 'test';

/** Per-resurstyp-resultat från diffResources(). */
export interface ResourceDiff {
  postgres_count: number;
  openehr_count: number;
  mismatch_count: number;
  /** Canonical-key-strängar (inte raw FHIR-id) som finns i postgres men inte openehr. */
  only_in_postgres: string[];
  only_in_openehr: string[];
  /** v1-scope: top-level + code.coding[0].code + valueQuantity.value. */
  field_coverage: Record<string, { postgres: number; openehr: number }>;
}

/** En enskild snapshot — motsvarar en rad i parity_snapshots. */
export interface ParitySnapshot extends ResourceDiff {
  resource_type: ResourceType;
  patient_pnr: string;
}

/** Failure för en specifik resurstyp inom en run. Loggas i audit som outcome. */
export interface ResourceFailure {
  resource_type: ResourceType;
  patient_pnr: string;
  error: string;
}

/** Resultat av en run (en eller flera patienter). Persisteras via recorder
 *  som N rader (en per snapshot) med samma run_id. */
export interface ParityRun {
  run_id: string;
  taken_at: Date;
  trigger: ParityTrigger;
  /** null när runForAll utan en specifik patient (aggregat); satt för runForPatient. */
  patient_pnr: string | null;
  snapshots: ParitySnapshot[];
  failures: ResourceFailure[];
}
