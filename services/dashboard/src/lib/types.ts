// Minimalt subset av FHIR + CDS Hooks-typer som dashboarden faktiskt läser.

export interface FhirBundle<T = FhirResource> {
  resourceType: 'Bundle';
  type: string;
  total?: number;
  entry?: Array<{ resource: T; search?: { mode?: string } }>;
}

export interface FhirReference {
  reference: string;
  display?: string;
}

export interface FhirCoding {
  system?: string;
  code: string;
  display?: string;
}

export interface FhirCodeableConcept {
  coding?: FhirCoding[];
  text?: string;
}

export interface FhirQuantity {
  value?: number;
  unit?: string;
  system?: string;
  code?: string;
}

export interface FhirPatient {
  resourceType: 'Patient';
  id: string;
  meta?: { source?: string; lastUpdated?: string };
  identifier?: Array<{ system?: string; value: string }>;
  name?: Array<{ family?: string; given?: string[]; text?: string }>;
  gender?: string;
  birthDate?: string;
  address?: Array<{ line?: string[]; postalCode?: string; city?: string; country?: string }>;
  telecom?: Array<{ system?: string; value?: string }>;
}

export interface FhirObservation {
  resourceType: 'Observation';
  id: string;
  status: string;
  category?: FhirCodeableConcept[];
  code: FhirCodeableConcept;
  subject: FhirReference;
  effectiveDateTime?: string;
  valueQuantity?: FhirQuantity;
  valueString?: string;
  component?: Array<{ code: FhirCodeableConcept; valueQuantity?: FhirQuantity }>;
  encounter?: FhirReference;
}

export interface FhirMedicationStatement {
  resourceType: 'MedicationStatement';
  id: string;
  status: string;
  medicationCodeableConcept?: FhirCodeableConcept;
  subject: FhirReference;
  effectivePeriod?: { start?: string; end?: string };
  dosage?: Array<{ text?: string }>;
}

export interface FhirCondition {
  resourceType: 'Condition';
  id: string;
  clinicalStatus?: FhirCodeableConcept;
  code?: FhirCodeableConcept;
  subject: FhirReference;
  onsetDateTime?: string;
  recordedDate?: string;
  encounter?: FhirReference;
}

export interface FhirProcedure {
  resourceType: 'Procedure';
  id: string;
  status: string;
  code?: FhirCodeableConcept;
  subject: FhirReference;
  performedDateTime?: string;
  performer?: Array<{ actor: FhirReference }>;
  bodySite?: FhirCodeableConcept[];
  extension?: Array<{ url: string; extension?: Array<{ url: string; valueString?: string }> }>;
  encounter?: FhirReference;
}

export interface FhirAllergyIntolerance {
  resourceType: 'AllergyIntolerance';
  id: string;
  code?: FhirCodeableConcept;
  patient: FhirReference;
  criticality?: string;
  reaction?: Array<{ manifestation: FhirCodeableConcept[]; severity?: string }>;
  recordedDate?: string;
}

export interface FhirEncounter {
  resourceType: 'Encounter';
  id: string;
  status: string;
  class?: FhirCoding;
  subject: FhirReference;
  period?: { start?: string; end?: string };
  serviceProvider?: { reference: string; display?: string };
}

export interface FhirDiagnosticReport {
  resourceType: 'DiagnosticReport';
  id: string;
  status: string;
  code: FhirCodeableConcept;
  effectiveDateTime?: string;
}

export type FhirResource =
  | FhirPatient
  | FhirObservation
  | FhirMedicationStatement
  | FhirCondition
  | FhirProcedure
  | FhirAllergyIntolerance
  | FhirEncounter
  | FhirDiagnosticReport;

// CDS Hooks
export interface CdsCard {
  uuid: string;
  summary: string;
  detail?: string;
  indicator: 'info' | 'warning' | 'critical';
  source: { label: string; url?: string };
  suggestions?: Array<{ label: string; uuid: string }>;
}

export interface CdsResponse {
  cards: CdsCard[];
}

// Audit
export interface AuditRow {
  audit_id: string;
  event_id: string;
  timestamp: string;
  actor_hsa_id: string | null;
  actor_name: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  patient_personnummer: string | null;
  care_unit: string | null;
  purpose: string | null;
  legal_basis: string | null;
  outcome: string | null;
  source_ip: string | null;
}
