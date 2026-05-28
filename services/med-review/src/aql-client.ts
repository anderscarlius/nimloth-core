// Klient mot aql-template-service (Kontrakt 1). Orkestratorn läser ALL data via
// honest-mallar — ingen rå-AQL i agenten (S3).

export interface ExecuteResult<Row = Record<string, unknown>> {
  template_id: string;
  template_version: string;
  executed_at: string;
  row_count: number;
  rows: Row[];
  meta: { ehrbase_ms: number; total_ms: number };
}

export class AqlClient {
  constructor(private readonly baseUrl: string) {}

  async execute<Row = Record<string, unknown>>(
    templateId: string,
    params: Record<string, string | number>,
  ): Promise<ExecuteResult<Row>> {
    const res = await fetch(
      `${this.baseUrl}/api/aql-templates/${encodeURIComponent(templateId)}/execute`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ params }),
      },
    );
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const b = (await res.json()) as { message?: string };
        if (b?.message) msg = b.message;
      } catch {
        /* keep */
      }
      throw new Error(`aql-template-service ${templateId}: ${msg}`);
    }
    return (await res.json()) as ExecuteResult<Row>;
  }
}

export const TEMPLATES = {
  medications: "se.nimloth.aql.active_medications",
  diagnoses: "se.nimloth.aql.active_diagnoses",
  trend: "se.nimloth.aql.observation_trend_by_period",
  allergies: "se.nimloth.aql.documented_allergies",
} as const;
