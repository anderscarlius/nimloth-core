import { runAql, EhrbaseError } from "../ehrbase-client.js";
import type { AqlSpec } from "./aql_queries.js";

export interface AqlRunResult {
  id: string;
  title: string;
  resultCount: number;
  rawRowCount: number;
  executionTimeMs: number;
  results: unknown[];
  error?: string;
}

export async function runQuery(spec: AqlSpec): Promise<AqlRunResult> {
  const t0 = Date.now();
  try {
    const res = await runAql<unknown[][]>(spec.aql);
    const rawRows = res.rows ?? [];
    const processed = spec.postProcess ? spec.postProcess(rawRows) : rawRows;
    return {
      id: spec.id,
      title: spec.title,
      resultCount: processed.length,
      rawRowCount: rawRows.length,
      executionTimeMs: Date.now() - t0,
      results: processed,
    };
  } catch (err) {
    const msg = err instanceof EhrbaseError ? `HTTP ${err.status}: ${err.body.slice(0, 200)}` : String(err);
    return {
      id: spec.id,
      title: spec.title,
      resultCount: 0,
      rawRowCount: 0,
      executionTimeMs: Date.now() - t0,
      results: [],
      error: msg,
    };
  }
}
