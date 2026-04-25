// FHIR R4-resurstyper (minimal subset för Nimloth Core).
// Fullständig FHIR-spec finns på https://www.hl7.org/fhir/R4/
// Vi implementerar bara de resurser och fält vi faktiskt använder.

export type FhirResourceType =
  | 'Patient'
  | 'Observation'
  | 'MedicationStatement'
  | 'Condition'
  | 'Procedure'
  | 'AllergyIntolerance'
  | 'Encounter'
  | 'DiagnosticReport'
  | 'CarePlan'
  | 'Bundle'
  | 'OperationOutcome';

export interface FhirIdentifier {
  system?: string;
  value: string;
  use?: 'usual' | 'official' | 'temp' | 'secondary' | 'old';
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

export interface FhirReference {
  reference: string; // t.ex. 'Patient/123'
  display?: string;
  identifier?: FhirIdentifier;
}

export interface FhirPeriod {
  start?: string;
  end?: string;
}

export interface FhirQuantity {
  value?: number;
  unit?: string;
  system?: string;
  code?: string;
  comparator?: '<' | '<=' | '>=' | '>';
}

export interface FhirMeta {
  versionId?: string;
  lastUpdated?: string;
  source?: string;
  profile?: string[];
  tag?: FhirCoding[];
}

export interface FhirHumanName {
  use?: 'usual' | 'official' | 'temp' | 'nickname' | 'anonymous' | 'old' | 'maiden';
  family?: string;
  given?: string[];
  text?: string;
}

export interface FhirAddress {
  line?: string[];
  city?: string;
  postalCode?: string;
  country?: string;
}

export interface FhirContactPoint {
  system?: 'phone' | 'fax' | 'email' | 'url';
  value?: string;
  use?: 'home' | 'work' | 'temp' | 'mobile';
}

// ============================================================
// Patient
// ============================================================
export interface FhirPatient {
  resourceType: 'Patient';
  id: string;
  meta?: FhirMeta;
  identifier?: FhirIdentifier[];
  active?: boolean;
  name?: FhirHumanName[];
  telecom?: FhirContactPoint[];
  gender?: 'male' | 'female' | 'other' | 'unknown';
  birthDate?: string;
  address?: FhirAddress[];
  deceasedBoolean?: boolean;
  deceasedDateTime?: string;
}

// ============================================================
// Observation
// ============================================================
export interface FhirObservationComponent {
  code: FhirCodeableConcept;
  valueQuantity?: FhirQuantity;
  valueString?: string;
}

export interface FhirObservation {
  resourceType: 'Observation';
  id: string;
  meta?: FhirMeta;
  status: 'registered' | 'preliminary' | 'final' | 'amended';
  category?: FhirCodeableConcept[];
  code: FhirCodeableConcept;
  subject: FhirReference;
  encounter?: FhirReference;
  effectiveDateTime?: string;
  issued?: string;
  performer?: FhirReference[];
  valueQuantity?: FhirQuantity;
  valueString?: string;
  interpretation?: FhirCodeableConcept[];
  referenceRange?: Array<{ low?: FhirQuantity; high?: FhirQuantity }>;
  component?: FhirObservationComponent[];
}

// ============================================================
// MedicationStatement
// ============================================================
export interface FhirMedicationStatement {
  resourceType: 'MedicationStatement';
  id: string;
  meta?: FhirMeta;
  status: 'active' | 'completed' | 'entered-in-error' | 'intended' | 'stopped' | 'on-hold';
  medicationCodeableConcept?: FhirCodeableConcept;
  subject: FhirReference;
  effectivePeriod?: FhirPeriod;
  dateAsserted?: string;
  informationSource?: FhirReference;
  dosage?: Array<{
    text?: string;
    route?: FhirCodeableConcept;
    doseAndRate?: Array<{ doseQuantity?: FhirQuantity }>;
  }>;
}

// ============================================================
// Condition
// ============================================================
export interface FhirCondition {
  resourceType: 'Condition';
  id: string;
  meta?: FhirMeta;
  clinicalStatus?: FhirCodeableConcept;
  verificationStatus?: FhirCodeableConcept;
  category?: FhirCodeableConcept[];
  code?: FhirCodeableConcept;
  subject: FhirReference;
  encounter?: FhirReference;
  onsetDateTime?: string;
  recordedDate?: string;
  recorder?: FhirReference;
}

// ============================================================
// Procedure
// ============================================================
export interface FhirProcedure {
  resourceType: 'Procedure';
  id: string;
  meta?: FhirMeta;
  status: 'preparation' | 'in-progress' | 'completed' | 'entered-in-error' | 'stopped' | 'unknown';
  code?: FhirCodeableConcept;
  subject: FhirReference;
  encounter?: FhirReference;
  performedDateTime?: string;
  performedPeriod?: FhirPeriod;
  performer?: Array<{ actor: FhirReference; function?: FhirCodeableConcept }>;
  bodySite?: FhirCodeableConcept[];
  extension?: Array<{ url: string; extension?: Array<{ url: string; valueString?: string }> }>;
}

// ============================================================
// AllergyIntolerance
// ============================================================
export interface FhirAllergyIntolerance {
  resourceType: 'AllergyIntolerance';
  id: string;
  meta?: FhirMeta;
  clinicalStatus?: FhirCodeableConcept;
  verificationStatus?: FhirCodeableConcept;
  type?: 'allergy' | 'intolerance';
  category?: Array<'food' | 'medication' | 'environment' | 'biologic'>;
  criticality?: 'low' | 'high' | 'unable-to-assess';
  code?: FhirCodeableConcept;
  patient: FhirReference;
  recordedDate?: string;
  recorder?: FhirReference;
  reaction?: Array<{ manifestation: FhirCodeableConcept[]; severity?: 'mild' | 'moderate' | 'severe' }>;
}

// ============================================================
// Encounter
// ============================================================
export interface FhirEncounter {
  resourceType: 'Encounter';
  id: string;
  meta?: FhirMeta;
  status: 'planned' | 'arrived' | 'triaged' | 'in-progress' | 'onleave' | 'finished' | 'cancelled';
  class?: FhirCoding;
  type?: FhirCodeableConcept[];
  subject: FhirReference;
  period?: FhirPeriod;
  reasonCode?: FhirCodeableConcept[];
  serviceProvider?: FhirReference;
  location?: Array<{ location: FhirReference; status?: string }>;
}

// ============================================================
// DiagnosticReport
// ============================================================
export interface FhirDiagnosticReport {
  resourceType: 'DiagnosticReport';
  id: string;
  meta?: FhirMeta;
  status: 'registered' | 'preliminary' | 'final' | 'amended';
  category?: FhirCodeableConcept[];
  code: FhirCodeableConcept;
  subject: FhirReference;
  effectiveDateTime?: string;
  issued?: string;
  result?: FhirReference[];
}

// ============================================================
// CarePlan
// ============================================================
export interface FhirCarePlan {
  resourceType: 'CarePlan';
  id: string;
  meta?: FhirMeta;
  status: 'draft' | 'active' | 'on-hold' | 'revoked' | 'completed' | 'entered-in-error' | 'unknown';
  intent: 'proposal' | 'plan' | 'order' | 'option';
  title?: string;
  subject: FhirReference;
  period?: FhirPeriod;
  description?: string;
}

// ============================================================
// Bundle
// ============================================================
export type FhirResource =
  | FhirPatient
  | FhirObservation
  | FhirMedicationStatement
  | FhirCondition
  | FhirProcedure
  | FhirAllergyIntolerance
  | FhirEncounter
  | FhirDiagnosticReport
  | FhirCarePlan;

export interface FhirBundleEntry {
  fullUrl?: string;
  resource: FhirResource;
  search?: { mode?: 'match' | 'include' | 'outcome'; score?: number };
}

export interface FhirBundle {
  resourceType: 'Bundle';
  id?: string;
  meta?: FhirMeta;
  type: 'searchset' | 'collection' | 'document' | 'message' | 'transaction' | 'batch' | 'history';
  total?: number;
  link?: Array<{ relation: string; url: string }>;
  entry?: FhirBundleEntry[];
}

// ============================================================
// OperationOutcome
// ============================================================
export interface FhirOperationOutcome {
  resourceType: 'OperationOutcome';
  id?: string;
  issue: Array<{
    severity: 'fatal' | 'error' | 'warning' | 'information';
    code: string;
    diagnostics?: string;
    details?: FhirCodeableConcept;
  }>;
}
