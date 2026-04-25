// Audit trail-typer som matchar schemas/audit.schema.json.

export interface AuditActor {
  hsa_id: string;
  name?: string;
  role?: string;
}

export type AuditAction = 'READ' | 'SEARCH' | 'CREATE' | 'UPDATE' | 'DELETE' | 'EXPORT';

export type AuditOutcome =
  | 'SUCCESS'
  | 'DENIED_NO_CARE_RELATION'
  | 'DENIED_BLOCKED'
  | 'EMERGENCY_ACCESS'
  | 'ERROR';

export interface AuditPdlContext {
  care_unit?: string;
  purpose?: string;
  legal_basis?: string;
}

export interface AuditEvent {
  event_id: string;
  timestamp: string;
  actor: AuditActor;
  action: AuditAction;
  resource_type: string; // 'Patient', 'Observation', etc.
  resource_id?: string;
  patient_id: string;
  pdl_context?: AuditPdlContext;
  outcome: AuditOutcome;
  source_ip?: string;
  user_agent?: string;
  request_id?: string;
}
