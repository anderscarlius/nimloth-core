import type {
  FhirPatientReadPolicyInput,
  FhirPatientReadPolicyResult,
  PolicyDecision,
} from './types.js';

/**
 * Runtime-evaluator som speglar `infra/opa/policies/fhir_patient_read.rego`.
 * Håll TS och Rego synkade — CI kör `opa test` på Rego-filen.
 */
export function evaluateFhirPatientRead(
  input: FhirPatientReadPolicyInput,
): FhirPatientReadPolicyResult {
  const justification = (input.emergency_justification ?? '').trim();

  if (input.emergency) {
    if (justification.length === 0) {
      return deny('EMERGENCY_JUSTIFICATION_REQUIRED');
    }
    return permit(['EMERGENCY_AUDIT_EXTENDED']);
  }

  if (!input.has_care_relation) {
    return deny('NO_CARE_RELATION');
  }

  if (input.blocked) {
    return deny('PATIENT_BLOCKED');
  }

  if (input.purpose === 'RESEARCH' && !input.research_consent) {
    return deny('RESEARCH_CONSENT_DENIED');
  }

  return permit();
}

function permit(obligations: string[] = []): FhirPatientReadPolicyResult {
  return {
    decision: 'PERMIT',
    allow: true,
    ...(obligations.length > 0 ? { reason: obligations.join(',') } : {}),
  };
}

function deny(reason: string): FhirPatientReadPolicyResult {
  return {
    decision: 'DENY',
    allow: false,
    reason,
  };
}

export function decisionFromAllow(allow: boolean, reason?: string): PolicyDecision {
  return allow ? 'PERMIT' : 'DENY';
}
