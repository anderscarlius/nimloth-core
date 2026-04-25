// Data-interfaces för seed.
// Matchar kolumnerna i Melior/AsynjaVisph men i snake_case TS-naming.

export interface PatientData {
  personnummer: string;
  fornamn: string;
  efternamn: string;
  fodelsedatum: string; // ISO YYYY-MM-DD
  kon: 'M' | 'K';
  adress?: string;
  postnr?: string;
  postort?: string;
  telefon?: string;
  encounters?: EncounterData[];
  allergies?: AllergyData[];
  /** För AsynjaVisph: kroniska diagnoser utanför encounter */
  chronic_diagnoses?: DiagnosisData[];
  /** För AsynjaVisph: aktuella läkemedel utanför encounter */
  chronic_prescriptions?: PrescriptionData[];
}

export interface EncounterData {
  encounter_type: 'INPATIENT' | 'OUTPATIENT' | 'EMERGENCY' | 'DAYCARE';
  department_code: string;
  department_name: string;
  admitting_doctor_hsa?: string;
  admitting_doctor_name?: string;
  admission_date: string; // ISO timestamp
  discharge_date?: string;
  discharge_diagnosis_icd?: string;
  status: 'ACTIVE' | 'DISCHARGED' | 'CANCELLED';
  observations?: ObservationData[];
  lab_results?: LabResultData[];
  prescriptions?: PrescriptionData[];
  procedures?: ProcedureData[];
  clinical_notes?: ClinicalNoteData[];
  diagnoses?: DiagnosisData[];
  referrals?: ReferralData[];
}

export interface AsynjaEncounterData {
  visit_type?: string;
  clinic_code: string;
  clinic_name: string;
  visit_doctor_hsa?: string;
  visit_doctor_name?: string;
  visit_date: string;
  visit_reason?: string;
  status?: string;
  lab_results?: LabResultData[]; // AsynjaVisph har inte lab-tabell men vi mappar via prescriptions
  prescriptions?: PrescriptionData[];
  diagnoses?: DiagnosisData[];
}

export interface AsynjaPatientData {
  personnummer: string;
  fornamn: string;
  efternamn: string;
  fodelsedatum: string;
  kon: 'M' | 'K';
  adress?: string;
  postnr?: string;
  postort?: string;
  telefon?: string;
  encounters?: AsynjaEncounterData[];
  prescriptions?: PrescriptionData[];
  diagnoses?: DiagnosisData[];
  allergies?: AllergyData[];
}

export interface ObservationData {
  observation_type:
    | 'BLOOD_PRESSURE'
    | 'HEART_RATE'
    | 'TEMPERATURE'
    | 'SPO2'
    | 'RESPIRATORY_RATE'
    | 'WEIGHT'
    | 'HEIGHT';
  value_numeric: number;
  value_numeric2?: number;
  unit: string;
  recorded_by_hsa?: string;
  recorded_at: string;
}

export interface LabResultData {
  order_id?: string;
  analysis_code: string;
  analysis_name: string;
  value_numeric?: number;
  value_text?: string;
  unit?: string;
  reference_low?: number;
  reference_high?: number;
  flag?: 'H' | 'L' | 'HH' | 'LL';
  ordering_doctor_hsa?: string;
  lab_system_code?: string;
  sample_collected_at?: string;
  result_available_at?: string;
}

export interface PrescriptionData {
  drug_name: string;
  atc_code: string;
  strength: string;
  dosage: string;
  route: 'PO' | 'IV' | 'SC' | 'IM' | 'TOP' | 'INH' | 'SL' | 'REC' | 'OPH';
  frequency: 'DAILY' | 'BID' | 'TID' | 'QID' | 'PRN' | 'WEEKLY' | 'MONTHLY';
  start_date: string;
  end_date?: string;
  prescribing_doctor_hsa?: string;
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'SUSPENDED';
}

export interface ProcedureData {
  procedure_code_kva: string;
  procedure_name: string;
  laterality?: 'LEFT' | 'RIGHT' | 'BILATERAL';
  implant_type?: string;
  implant_manufacturer?: string;
  implant_model?: string;
  implant_size?: string;
  performing_surgeon_hsa?: string;
  performing_surgeon_name?: string;
  procedure_date: string;
  duration_minutes?: number;
  anesthesia_type?: 'GENERAL' | 'SPINAL' | 'EPIDURAL' | 'LOCAL';
  complications?: string;
}

export interface ClinicalNoteData {
  note_type:
    | 'ADMISSION_NOTE'
    | 'PROGRESS_NOTE'
    | 'DISCHARGE_SUMMARY'
    | 'OP_REPORT'
    | 'CONSULTATION'
    | 'PHYSIOTHERAPY';
  department_code?: string;
  author_hsa?: string;
  author_name?: string;
  author_role: 'PHYSICIAN' | 'NURSE' | 'PHYSIOTHERAPIST' | 'PSYCHOLOGIST' | 'DIETITIAN';
  content: string;
  signed?: boolean;
  signed_at?: string;
  cosigned_by_hsa?: string;
}

export interface DiagnosisData {
  icd_code: string;
  diagnosis_text: string;
  diagnosis_type: 'PRIMARY' | 'SECONDARY' | 'COMPLICATION' | 'CHRONIC';
  diagnosed_by_hsa?: string;
  diagnosed_at: string;
  resolved_at?: string;
}

export interface AllergyData {
  allergen: string;
  reaction: string;
  severity: 'MILD' | 'MODERATE' | 'SEVERE';
  verified?: boolean;
  reported_by_hsa?: string;
  reported_at?: string;
}

export interface ReferralData {
  from_department: string;
  to_department: string;
  referral_reason: string;
  priority: 'ROUTINE' | 'URGENT' | 'EMERGENCY';
  status: 'SENT' | 'RECEIVED' | 'ACCEPTED' | 'COMPLETED' | 'REJECTED';
  referring_doctor_hsa?: string;
  sent_at: string;
}
