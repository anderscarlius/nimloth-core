export type PdlPurpose = 'CARE' | 'EMERGENCY' | 'QUALITY_REGISTRY' | 'ADMINISTRATION' | 'RESEARCH';

/** Input till OPA-policy `nimloth.fhir_patient_read` (dataklass 0). */
export interface FhirPatientReadPolicyInput {
  has_care_relation: boolean;
  emergency: boolean;
  /** Obligatorisk vid emergency (PDL § 4 / arkitektur § 11.3). */
  emergency_justification: string;
  blocked: boolean;
  purpose: PdlPurpose;
  /** Krävs när purpose = RESEARCH. */
  research_consent: boolean;
}

export type PolicyDecision = 'PERMIT' | 'DENY';

export interface FhirPatientReadPolicyResult {
  decision: PolicyDecision;
  /** Maskinläsbar orsak vid DENY (speglar OPA `deny_reason`). */
  reason?: string;
  /** OPA `allow` — för parity med Rego-test. */
  allow: boolean;
}
