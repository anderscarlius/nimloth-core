import { runAql } from "../ehrbase-client.js";
import type { PatientLoadResult } from "./LoadPipeline.js";

export interface SpotCheckResult {
  patientId: string;
  ehrId: string;
  expected: number;
  found: number;
  ok: boolean;
}

export interface VerifierSummary {
  spotChecks: SpotCheckResult[];
  okCount: number;
  totalCount: number;
  okRatio: number;
}

function pickN<T>(arr: T[], n: number, rng: () => number): T[] {
  if (arr.length <= n) return arr;
  const pool = [...arr];
  const out: T[] = [];
  for (let i = 0; i < n && pool.length > 0; i++) {
    const idx = Math.floor(rng() * pool.length);
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

export async function spotCheck(
  loadResults: PatientLoadResult[],
  count = 5,
  rngSeed = 42,
): Promise<VerifierSummary> {
  let s = rngSeed;
  const rng = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };

  const successfullyLoaded = loadResults.filter(
    (r) => r.ehrId && !r.ehrId.startsWith("DRY-") && r.compositionUids.length > 0,
  );
  const picks = pickN(successfullyLoaded, count, rng);
  const checks: SpotCheckResult[] = [];

  for (const r of picks) {
    const aql = `SELECT COUNT(c) FROM EHR e CONTAINS COMPOSITION c WHERE e/ehr_id/value = '${r.ehrId!}'`;
    try {
      const res = await runAql<unknown[][]>(aql);
      const rawCount = res.rows?.[0]?.[0];
      const found = typeof rawCount === "number" ? rawCount : Number(rawCount ?? 0);
      const expected = r.compositionUids.length;
      checks.push({
        patientId: r.patientId,
        ehrId: r.ehrId!,
        expected,
        found,
        ok: found >= expected,
      });
    } catch (err) {
      checks.push({
        patientId: r.patientId,
        ehrId: r.ehrId!,
        expected: r.compositionUids.length,
        found: 0,
        ok: false,
      });
    }
  }

  const okCount = checks.filter((c) => c.ok).length;
  return {
    spotChecks: checks,
    okCount,
    totalCount: checks.length,
    okRatio: checks.length === 0 ? 0 : okCount / checks.length,
  };
}
