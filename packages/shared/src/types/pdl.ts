// PDL (patientdatalagen) — kontext, vårdrelation, spärrregister.

export type PdlPurpose = 'CARE' | 'QUALITY_REGISTRY' | 'RESEARCH' | 'ADMINISTRATION';

/** Legal basis enligt PDL. 'PDL_2_4' = vårdrelation, 'PDL_4_1' = nödöppning. */
export type PdlLegalBasis = 'PDL_2_4' | 'PDL_4_1' | 'PDL_6_1' | 'PDL_CONSENT';

export interface PdlContext {
  care_unit?: string;
  care_provider?: string;
  purpose: PdlPurpose;
  legal_basis: PdlLegalBasis;
}

export interface CareRelation {
  patient_id: string; // personnummer
  user_hsa: string;
  care_unit: string;
  established_at: string;
  expires_at?: string;
}

export interface SparBlock {
  personnummer: string;
  blocked_for: string[]; // HSA-ID för blockerade enheter
  reason?: string;
  established_at: string;
  expires_at?: string;
}
