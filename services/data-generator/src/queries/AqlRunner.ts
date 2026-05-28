import { runAql, EhrbaseError } from "../ehrbase-client.js";
import { bindAqlParams, type AqlSpec } from "./aql_queries.js";

export interface AqlRunResult {
  id: string;
  title: string;
  resultCount: number;
  rawRowCount: number;
  executionTimeMs: number;
  results: unknown[];
  error?: string;
}

/** Optional per-call parameter overrides — Fas 2 will pass these to lift
 *  thresholds (e.g. {hba1c_threshold: 90}). Defaults shipped on the spec. */
export interface RunOptions {
  paramsOverride?: Record<string, number | string>;
}

export async function runQuery(
  spec: AqlSpec,
  opts: RunOptions = {},
): Promise<AqlRunResult> {
  const t0 = Date.now();
  const effectiveParams = { ...(spec.params ?? {}), ...(opts.paramsOverride ?? {}) };
  const aql = bindAqlParams(spec.aql, effectiveParams);
  const title = bindAqlParams(spec.title, effectiveParams);
  try {
    const res = await runAql<unknown[][]>(aql);
    const rawRows = res.rows ?? [];
    const processed = spec.postProcess ? spec.postProcess(rawRows) : rawRows;
    return {
      id: spec.id,
      title,
      resultCount: processed.length,
      rawRowCount: rawRows.length,
      executionTimeMs: Date.now() - t0,
      results: processed,
    };
  } catch (err) {
    const msg = err instanceof EhrbaseError ? `HTTP ${err.status}: ${err.body.slice(0, 200)}` : String(err);
    return {
      id: spec.id,
      title,
      resultCount: 0,
      rawRowCount: 0,
      executionTimeMs: Date.now() - t0,
      results: [],
      error: msg,
    };
  }
}
