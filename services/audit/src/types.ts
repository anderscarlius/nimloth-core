// Shape av audit-event från core.audit.access (producerat av fhir-facade).
export interface AuditEventMessage {
  event_id: string;
  timestamp: string;
  actor: { hsa_id: string; name?: string; role?: string };
  action: string;
  resource_type: string;
  resource_id?: string;
  patient_id?: string;
  pdl_context?: { care_unit?: string; purpose?: string; legal_basis?: string };
  outcome: string;
  source_ip?: string;
  user_agent?: string;
  request_id?: string;
  duration_ms?: number;
}
