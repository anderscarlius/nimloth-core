// Klient mot aql-template-service (Fas 2). Proxas via /api/aql-templates
// (se vite.config.ts). MVP: ingen auth-header (mock-auth släpper igenom).

const BASE = '/api/aql-templates';

export interface ExecuteResponse<Row = Record<string, unknown>> {
  template_id: string;
  template_version: string;
  executed_at: string;
  row_count: number;
  rows: Row[];
  meta: { ehrbase_ms: number; total_ms: number };
}

export interface TrendPoint {
  timestamp: string;
  analyte: string;
  magnitude: number;
  unit: string;
}

export interface ResponderRow {
  first_lab_date: string;
  first_lab_magnitude: number;
  last_lab_date: string;
  last_lab_magnitude: number;
  rx_at: string;
  delta: number;
}

export interface FollowupRow {
  status: 'dropout' | 'on_track' | 'no_diabetes_diagnosis';
  diagnosis_date: string | null;
  followup_date: string | null;
}

export class TemplateExecError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

async function execute<Row>(
  templateId: string,
  params: Record<string, string | number>,
): Promise<ExecuteResponse<Row>> {
  const res = await fetch(`${BASE}/${encodeURIComponent(templateId)}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ params }),
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body?.message) msg = body.message;
    } catch {
      /* keep msg */
    }
    throw new TemplateExecError(res.status, msg);
  }
  return (await res.json()) as ExecuteResponse<Row>;
}

export const TEMPLATE_IDS = {
  observationTrend: 'se.nimloth.aql.observation_trend_by_period',
  responder: 'se.nimloth.aql.responder_after_rx',
  nonresponder: 'se.nimloth.aql.nonresponder_after_rx',
  dropout: 'se.nimloth.aql.diabetes_without_followup',
} as const;

export function fetchObservationTrend(
  patientId: string,
  opts: { analyte?: string; fromDate?: string; toDate?: string } = {},
): Promise<ExecuteResponse<TrendPoint>> {
  const params: Record<string, string | number> = { patient_id: patientId };
  if (opts.analyte) params.analyte = opts.analyte;
  if (opts.fromDate) params.from_date = opts.fromDate;
  if (opts.toDate) params.to_date = opts.toDate;
  return execute<TrendPoint>(TEMPLATE_IDS.observationTrend, params);
}

export function fetchResponder(patientId: string): Promise<ExecuteResponse<ResponderRow>> {
  return execute<ResponderRow>(TEMPLATE_IDS.responder, { patient_id: patientId });
}

export function fetchNonresponder(patientId: string): Promise<ExecuteResponse<ResponderRow>> {
  return execute<ResponderRow>(TEMPLATE_IDS.nonresponder, { patient_id: patientId });
}

export function fetchFollowupStatus(patientId: string): Promise<ExecuteResponse<FollowupRow>> {
  return execute<FollowupRow>(TEMPLATE_IDS.dropout, { patient_id: patientId });
}
