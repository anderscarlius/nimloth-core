// AQL-mall-tjänst — typkontrakt (Kontrakt 1, MVP-snitt).

export type ParameterType = "string" | "number" | "date";

export interface ParameterSpec {
  name: string;
  type: ParameterType;
  required: boolean;
  description: string;
  /** Optional default for non-required params. Applied if caller omits. */
  default?: string | number;
}

export interface OutputColumn {
  name: string;
  type: string;
  description?: string;
}

/** Template category — separates raw retrieval from clinical judgement.
 *   "data-query"      — returns observations/facts as-is (trend, threshold).
 *   "quality-measure" — returns a descriptive clinical classification
 *                       (dropout / responder). NEVER imperative — the template
 *                       describes state, the consumer decides action. */
export type TemplateCategory = "data-query" | "quality-measure";

export interface TemplateMetadata {
  /** Promotion tier from SDG-10 — only "honest" templates land in the registry. */
  tier: "honest" | "proxy";
  /** data-query vs quality-measure — gates which templates a trend-component
   *  may plot directly (data-query only). */
  category: TemplateCategory;
  /** Provenance: which SDG-08 query this template descended from. */
  sourceAqlId?: string;
  /** Clinical intent in plain Swedish — descriptive, never imperative. */
  intent: string;
}

export interface TemplateDescriptor {
  id: string;
  version: string;
  title: string;
  description: string;
  parameters: ParameterSpec[];
  output: { columns: OutputColumn[] };
  metadata: TemplateMetadata;
}

export interface TemplateDefinition extends TemplateDescriptor {
  /** AQL with `:param` placeholders that map to ParameterSpec.name. */
  aql: string;
  /** Optional client-side post-processor. Receives raw EHRbase rows + bound
   *  parameters (after default-application) so it can apply window-checks or
   *  composite filters that AQL cannot express. */
  postProcess?: (rows: unknown[][], params: Record<string, string | number>) => unknown[];
}

export interface ListResponse {
  templates: TemplateDescriptor[];
  total: number;
}

export interface ExecuteRequest {
  params?: Record<string, string | number>;
}

export interface ExecuteResponse {
  template_id: string;
  template_version: string;
  executed_at: string;
  row_count: number;
  rows: unknown[];
  meta: {
    /** EHRbase round-trip time (ms). */
    ehrbase_ms: number;
    /** Total service-side execution (substitution + EHRbase + postProcess). */
    total_ms: number;
  };
}

export interface ErrorBody {
  error: string;
  message: string;
  details?: Record<string, unknown>;
}
