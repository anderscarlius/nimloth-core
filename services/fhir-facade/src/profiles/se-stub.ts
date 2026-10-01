// Svensk profil-stub från infra/fhir/ig (DP-MF3). Runtime använder canonical URL
// från sushi-config — full nationell SE-IG är medvetet utanför WP-FHIR1-scope.

import type { FhirPatient } from '@nimloth-core/shared/types';

/** packageId / canonical från infra/fhir/ig/sushi-config.yaml */
export const NIMLOTH_IG_CANONICAL_BASE = 'https://fhir.nimloth.local/ig/stub';

export const NIMLOTH_STUB_PATIENT_PROFILE = `${NIMLOTH_IG_CANONICAL_BASE}/StructureDefinition/nimloth-stub-patient`;

/**
 * Observation: ingen egen FSH-profil i MF3 v1 — dokumenterat gap (se WP-FHIR1-docs).
 * Vitals mappas från openEHR-OBSERVATION via AQL; nationell profil kommer senare.
 */
export const NIMLOTH_STUB_OBSERVATION_PROFILE: string | null = null;

export function withStubPatientProfile(patient: FhirPatient): FhirPatient {
  const existing = patient.meta?.profile ?? [];
  if (existing.includes(NIMLOTH_STUB_PATIENT_PROFILE)) {
    return patient;
  }
  return {
    ...patient,
    meta: {
      ...patient.meta,
      profile: [...existing, NIMLOTH_STUB_PATIENT_PROFILE],
    },
  };
}
