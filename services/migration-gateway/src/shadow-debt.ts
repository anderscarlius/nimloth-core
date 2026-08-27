// Skuggskuldsmätning (Grind 1 punkt f). I S2 är ett FAILED-försök i
// reverse_shadow_write_log inte bara en felrad — det är en skuld mot en
// framtida S2→S3-återgång: återgångstid = växlingstid + (skuld ×
// replay-latens). Denna fil besvarar precis den frågan, inget mer (S7 —
// ingen automatisk catch-up, ingen retry-motor, bara mätningen).

import type pg from "pg";

export interface ShadowDebtReport {
  failedCount: number;
  oldestFailedAt: string | null;
  lagSeconds: number | null;
  avgSuccessDurationMs: number | null;
  estimatedCatchUpMs: number | null;
}

export async function getShadowDebt(pool: pg.Pool): Promise<ShadowDebtReport> {
  const failed = await pool.query(
    `SELECT COUNT(*)::int AS count, MIN(attempted_at) AS oldest
     FROM reverse_shadow_write_log WHERE status = 'FAILED'`,
  );
  const succeeded = await pool.query(
    `SELECT AVG(duration_ms)::float AS avg_duration_ms
     FROM reverse_shadow_write_log WHERE status = 'SUCCESS'`,
  );

  const failedCount = failed.rows[0].count as number;
  const oldestFailedAt = failed.rows[0].oldest as string | null;
  const avgSuccessDurationMs = succeeded.rows[0].avg_duration_ms as number | null;

  const lagSeconds = oldestFailedAt
    ? Math.round((Date.now() - new Date(oldestFailedAt).getTime()) / 1000)
    : null;
  const estimatedCatchUpMs =
    failedCount > 0 && avgSuccessDurationMs !== null ? Math.round(failedCount * avgSuccessDurationMs) : null;

  return { failedCount, oldestFailedAt, lagSeconds, avgSuccessDurationMs, estimatedCatchUpMs };
}
