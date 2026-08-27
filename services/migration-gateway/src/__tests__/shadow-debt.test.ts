// Grind 1 punkt f: "hur långt efter ligger legacy, vad kostar det att
// komma ikapp" — den siffra en CIO vill se innan hen godkänner S2.

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type pg from "pg";
import { freshTestPool } from "./test-db.js";
import { getShadowDebt } from "../shadow-debt.js";

let pool: pg.Pool;

beforeEach(async () => {
  pool = await freshTestPool();
});

afterAll(async () => {
  await pool?.end();
});

async function insertLogRow(
  status: "SUCCESS" | "FAILED",
  durationMs: number,
  attemptedAt?: Date,
): Promise<void> {
  await pool.query(
    `INSERT INTO reverse_shadow_write_log
       (composition_uid, vo_id, ehr_id, patient_no, care_unit, note_text, note_created_at, status, duration_ms, attempted_at)
     VALUES ($1, $2, $3, '1001', 'vc-lund-norr', 'text', NOW(), $4, $5, COALESCE($6, NOW()))`,
    [`${randomUUID()}::local.ehrbase.org::1`, randomUUID(), randomUUID(), status, durationMs, attemptedAt ?? null],
  );
}

describe("getShadowDebt", () => {
  it("tom logg ger noll skuld och inga mätvärden att räkna på", async () => {
    const debt = await getShadowDebt(pool);
    expect(debt).toEqual({
      failedCount: 0,
      oldestFailedAt: null,
      lagSeconds: null,
      avgSuccessDurationMs: null,
      estimatedCatchUpMs: null,
    });
  });

  it("räknar FAILED-poster och uppskattar ikapp-kostnad från SUCCESS-latensen", async () => {
    await insertLogRow("SUCCESS", 100);
    await insertLogRow("SUCCESS", 200);
    await insertLogRow("FAILED", 0);

    const debt = await getShadowDebt(pool);
    expect(debt.failedCount).toBe(1);
    expect(debt.avgSuccessDurationMs).toBe(150);
    expect(debt.estimatedCatchUpMs).toBe(150);
    expect(debt.oldestFailedAt).not.toBeNull();
    expect(debt.lagSeconds).toBeGreaterThanOrEqual(0);
  });

  it("flera FAILED-poster: äldsta avgör hur långt efter, alla räknas i ikapp-kostnaden", async () => {
    const older = new Date(Date.now() - 60_000);
    await insertLogRow("SUCCESS", 100);
    await insertLogRow("FAILED", 0, older);
    await insertLogRow("FAILED", 0);

    const debt = await getShadowDebt(pool);
    expect(debt.failedCount).toBe(2);
    expect(debt.estimatedCatchUpMs).toBe(200);
    expect(debt.lagSeconds).toBeGreaterThanOrEqual(59);
  });
});
