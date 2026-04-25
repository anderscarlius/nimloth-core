// Event-typer som matchar JSON Schemas i packages/shared/src/schemas/.
// Dessa används av producers och consumers för typesäker event-hantering.

import type { PdlContext } from './pdl.js';

export type SourceSystem = 'melior' | 'asynja' | 'core' | 'edge';

export interface Recorder {
  hsa_id: string;
  name?: string;
  role?: string;
}

export interface CodedValue {
  system?: string;
  code: string;
  display: string;
}

export interface BaseEvent {
  event_id: string;
  event_type: string;
  event_version: string;
  timestamp: string;
  source_system: SourceSystem;
  source_instance?: string;
  patient_id: string;
  producer_id?: string;
  pdl_context?: PdlContext;
  correlation_id?: string;
}

// ============================================================
// Vitals
// ============================================================
export type VitalsObservationType =
  | 'BLOOD_PRESSURE'
  | 'HEART_RATE'
  | 'TEMPERATURE'
  | 'SPO2'
  | 'RESPIRATORY_RATE'
  | 'WEIGHT'
  | 'HEIGHT';

export interface VitalsValue {
  code?: string;
  display?: string;
  value: number;
  unit: string;
}

export interface VitalsEvent extends BaseEvent {
  payload: {
    observation_type: VitalsObservationType;
    values: VitalsValue[];
    recorded_by: Recorder;
    recorded_at: string;
    encounter_id?: string;
  };
}

// ============================================================
// Lab Result
// ============================================================
export type LabFlag = 'H' | 'L' | 'HH' | 'LL';

export interface LabResultEvent extends BaseEvent {
  payload: {
    order_id?: string;
    analysis: CodedValue;
    result: {
      value_numeric?: number;
      value_text?: string;
      unit?: string;
      reference_low?: number;
      reference_high?: number;
      flag?: LabFlag;
    };
    ordering_doctor?: Recorder;
    lab_system_code?: string;
    sample_collected_at?: string;
    result_available_at?: string;
    encounter_id?: string;
  };
}

// ============================================================
// Medication
// ============================================================
export type MedicationAction = 'PRESCRIBED' | 'DISPENSED' | 'ADMINISTERED' | 'CANCELLED';
export type MedicationRoute = 'PO' | 'IV' | 'SC' | 'IM' | 'TOP' | 'INH' | 'SL' | 'REC' | 'OPH';
export type MedicationFrequency = 'DAILY' | 'BID' | 'TID' | 'QID' | 'PRN' | 'WEEKLY' | 'MONTHLY';
export type MedicationStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'SUSPENDED';

export interface MedicationEvent extends BaseEvent {
  payload: {
    action: MedicationAction;
    medication: CodedValue;
    drug_name?: string;
    atc_code?: string;
    strength?: string;
    dosage?: string;
    route?: MedicationRoute;
    frequency?: MedicationFrequency;
    start_date: string;
    end_date?: string;
    prescribed_by: Recorder;
    status?: MedicationStatus;
    encounter_id?: string;
  };
}

// ============================================================
// Procedure
// ============================================================
export type Laterality = 'LEFT' | 'RIGHT' | 'BILATERAL';
export type AnesthesiaType = 'GENERAL' | 'SPINAL' | 'EPIDURAL' | 'LOCAL';

export interface ProcedureEvent extends BaseEvent {
  payload: {
    procedure: CodedValue;
    procedure_code_kva?: string;
    procedure_name?: string;
    laterality?: Laterality;
    implant?: {
      type?: string;
      manufacturer?: string;
      model?: string;
      size?: string;
    };
    performer?: Recorder;
    procedure_date: string;
    duration_minutes?: number;
    anesthesia_type?: AnesthesiaType;
    complications?: string;
    encounter_id?: string;
  };
}

// ============================================================
// Condition
// ============================================================
export type DiagnosisType = 'PRIMARY' | 'SECONDARY' | 'COMPLICATION' | 'CHRONIC';

export interface ConditionEvent extends BaseEvent {
  payload: {
    diagnosis: CodedValue;
    icd_code?: string;
    diagnosis_text?: string;
    diagnosis_type?: DiagnosisType;
    diagnosed_by?: Recorder;
    diagnosed_at: string;
    resolved_at?: string;
    encounter_id?: string;
  };
}

// ============================================================
// Allergy
// ============================================================
export type AllergySeverity = 'MILD' | 'MODERATE' | 'SEVERE';

export interface AllergyEvent extends BaseEvent {
  payload: {
    allergen: string;
    allergen_coded?: CodedValue;
    reaction?: string;
    severity: AllergySeverity;
    verified?: boolean;
    reported_by?: Recorder;
    reported_at: string;
  };
}

// ============================================================
// Encounter
// ============================================================
export type EncounterAction = 'STARTED' | 'ENDED';
export type EncounterType = 'INPATIENT' | 'OUTPATIENT' | 'EMERGENCY' | 'DAYCARE';
export type EncounterStatus = 'ACTIVE' | 'DISCHARGED' | 'CANCELLED';

export interface EncounterEvent extends BaseEvent {
  payload: {
    action: EncounterAction;
    encounter_id?: string;
    encounter_type: EncounterType;
    department_code: string;
    department_name?: string;
    admitting_doctor?: Recorder;
    admission_date: string;
    discharge_date?: string;
    discharge_diagnosis_icd?: string;
    status?: EncounterStatus;
  };
}

// ============================================================
// Note
// ============================================================
export type NoteType =
  | 'ADMISSION_NOTE'
  | 'PROGRESS_NOTE'
  | 'DISCHARGE_SUMMARY'
  | 'OP_REPORT'
  | 'CONSULTATION'
  | 'PHYSIOTHERAPY';

export interface NoteEvent extends BaseEvent {
  payload: {
    note_type: NoteType;
    department_code?: string;
    author: Recorder;
    content: string;
    signed?: boolean;
    signed_at?: string;
    cosigned_by_hsa?: string;
    encounter_id?: string;
  };
}

// ============================================================
// Referral
// ============================================================
export type ReferralPriority = 'ROUTINE' | 'URGENT' | 'EMERGENCY';
export type ReferralStatus = 'SENT' | 'RECEIVED' | 'ACCEPTED' | 'COMPLETED' | 'REJECTED';

export interface ReferralEvent extends BaseEvent {
  payload: {
    from_department: string;
    to_department: string;
    referral_reason?: string;
    priority: ReferralPriority;
    status: ReferralStatus;
    referring_doctor?: Recorder;
    sent_at: string;
  };
}

// ============================================================
// Union av alla kliniska events
// ============================================================
export type ClinicalEvent =
  | VitalsEvent
  | LabResultEvent
  | MedicationEvent
  | ProcedureEvent
  | ConditionEvent
  | AllergyEvent
  | EncounterEvent
  | NoteEvent
  | ReferralEvent;
