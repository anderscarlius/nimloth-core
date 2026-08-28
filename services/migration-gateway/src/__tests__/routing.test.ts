// S5/I3: varje routingändring auditeras. Testet nedan är exakt det S5
// efterfrågar: "ett test som fäller om en routingändring inte auditeras."
//
// B4 Etapp 2: routing_history är append-only (Grind 1 punkt d) — samma
// tester som Etapp 1 gäller fortfarande (nuvarande läge är bara
// historikens senaste rad), plus nya tester för NIMLOTH och för
// auktoritetsproveniens över tid (atTime).

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type pg from "pg";
import { freshTestPool } from "./test-db.js";
import { fakeAudit } from "./fakes.js";
import { getDirection, setDirection, listRouting, DEFAULT_DIRECTION } from "../routing.js";
import type { GatewayAuditPublisher } from "../audit.js";

let pool: pg.Pool;

beforeEach(async () => {
  pool = await freshTestPool();
});

afterAll(async () => {
  await pool?.end();
});

describe("routinghistoriken", () => {
  it("okänd (domän, enhet) ger DEFAULT_DIRECTION (LEGACY_ONLY) — S0-utgångsläget", async () => {
    await expect(getDirection(pool, "anteckning", "okand-enhet")).resolves.toBe(DEFAULT_DIRECTION);
  });

  it("en satt riktning läses tillbaka", async () => {
    const audit = fakeAudit();
    await setDirection(pool, audit, {
      domain: "anteckning",
      careUnit: "vc-lund-norr",
      direction: "SHADOW",
      updatedBy: "test-operator",
    });
    await expect(getDirection(pool, "anteckning", "vc-lund-norr")).resolves.toBe("SHADOW");
  });

  it("NIMLOTH är en giltig riktning (S2, B4 Etapp 2)", async () => {
    const audit = fakeAudit();
    await setDirection(pool, audit, {
      domain: "anteckning",
      careUnit: "vc-lund-norr",
      direction: "NIMLOTH",
      updatedBy: "test-operator",
    });
    await expect(getDirection(pool, "anteckning", "vc-lund-norr")).resolves.toBe("NIMLOTH");
  });

  it("hot-reload: ändringen syns direkt i nästa fråga, ingen omstart, ingen cache", async () => {
    const audit = fakeAudit();
    await setDirection(pool, audit, {
      domain: "anteckning",
      careUnit: "vc-lund-norr",
      direction: "SHADOW",
      updatedBy: "op1",
    });
    expect(await getDirection(pool, "anteckning", "vc-lund-norr")).toBe("SHADOW");

    await setDirection(pool, audit, {
      domain: "anteckning",
      careUnit: "vc-lund-norr",
      direction: "LEGACY_ONLY",
      updatedBy: "op2",
    });
    expect(await getDirection(pool, "anteckning", "vc-lund-norr")).toBe("LEGACY_ONLY");
  });

  it("append-only: historiken växer, ingen rad muteras (routing_history har ingen UPDATE-väg i koden)", async () => {
    const audit = fakeAudit();
    await setDirection(pool, audit, { domain: "anteckning", careUnit: "vc-lund-norr", direction: "SHADOW", updatedBy: "op1" });
    await setDirection(pool, audit, { domain: "anteckning", careUnit: "vc-lund-norr", direction: "NIMLOTH", updatedBy: "op2" });
    const rows = await pool.query(
      `SELECT direction FROM routing_history WHERE domain='anteckning' AND care_unit='vc-lund-norr' ORDER BY changed_at ASC`,
    );
    expect(rows.rows.map((r) => r.direction)).toEqual(["SHADOW", "NIMLOTH"]);
  });

  // B7 (2026-08-28): den tidigare varianten satte tidsstämplar via
  // SELECT NOW() + en riktig setTimeout-paus (10ms, sedan 100ms efter
  // B4 Etapp 3) mellan skrivningarna — en race mot verklig väggklocka,
  // inte mot data. Flakade två gånger under verklig belastning (lokal
  // full svit, och sedan skarpt i GitHub Actions när tre workflow-körningar
  // gick samtidigt) trots höjningen. Roten var fel klass av fix — mer
  // marginal löser inte en race mot väggklockan, det gör den bara
  // mer sällsynt. Skriver nu EXPLICITA changed_at-tidsstämplar direkt
  // (bypassar setDirection helt för dessa två tester, som ändå bara
  // testar getDirection:s punkt-i-tiden-rekonstruktion, inte skrivvägen)
  // — ordningen avgörs av datat, aldrig av hur snabbt en frågeomgång
  // råkar gå.
  async function insertHistoryAt(direction: string, changedAt: Date, changedBy: string): Promise<void> {
    await pool.query(
      `INSERT INTO routing_history (domain, care_unit, direction, changed_at, changed_by)
       VALUES ('anteckning', 'vc-lund-norr', $1, $2, $3)`,
      [direction, changedAt, changedBy],
    );
  }

  it("auktoritetsproveniens över tid: atTime rekonstruerar vad som gällde vid en given tidpunkt, inte bara nu", async () => {
    const t1 = new Date(Date.now() - 60_000);
    const between = new Date(Date.now() - 45_000);
    const t2 = new Date(Date.now() - 30_000);
    await insertHistoryAt("SHADOW", t1, "op1");
    await insertHistoryAt("NIMLOTH", t2, "op2");

    expect(await getDirection(pool, "anteckning", "vc-lund-norr", between)).toBe("SHADOW");
    expect(await getDirection(pool, "anteckning", "vc-lund-norr")).toBe("NIMLOTH");
  });

  it("atTime före första ändringen ger DEFAULT_DIRECTION", async () => {
    const before = new Date(Date.now() - 60_000);
    await insertHistoryAt("SHADOW", new Date(Date.now() - 30_000), "op1");
    expect(await getDirection(pool, "anteckning", "vc-lund-norr", before)).toBe(DEFAULT_DIRECTION);
  });

  it("FÄLLER om en routingändring inte auditeras (S5-kravet, ordagrant)", async () => {
    const emit = vi.fn().mockResolvedValue(undefined);
    const spyAudit: GatewayAuditPublisher = { emit, stop: async () => {} };

    await setDirection(pool, spyAudit, {
      domain: "anteckning",
      careUnit: "vc-lund-norr",
      direction: "SHADOW",
      updatedBy: "test-operator",
    });

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(
      "ROUTING_CHANGED",
      expect.objectContaining({
        resourceType: "RoutingConfig",
        resourceId: "anteckning/vc-lund-norr",
        details: expect.objectContaining({ from: "LEGACY_ONLY", to: "SHADOW" }),
      }),
    );
  });

  it("B4 Etapp 3, A6: auditspåret är obrutet över S2→S3-återgången specifikt (NIMLOTH -> LEGACY_ONLY), inte bara routingändringar i allmänhet", async () => {
    const emit = vi.fn().mockResolvedValue(undefined);
    const spyAudit: GatewayAuditPublisher = { emit, stop: async () => {} };

    await setDirection(pool, spyAudit, { domain: "anteckning", careUnit: "vc-lund-norr", direction: "NIMLOTH", updatedBy: "op1" });
    await setDirection(pool, spyAudit, { domain: "anteckning", careUnit: "vc-lund-norr", direction: "LEGACY_ONLY", updatedBy: "revert-operator" });

    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenNthCalledWith(
      2,
      "ROUTING_CHANGED",
      expect.objectContaining({
        resourceId: "anteckning/vc-lund-norr",
        details: expect.objectContaining({ from: "NIMLOTH", to: "LEGACY_ONLY" }),
      }),
    );
  });

  it("listRouting listar bara senaste raden per (domän, enhet), inte hela historiken", async () => {
    const audit = fakeAudit();
    await setDirection(pool, audit, { domain: "anteckning", careUnit: "a", direction: "SHADOW", updatedBy: "op" });
    await setDirection(pool, audit, { domain: "anteckning", careUnit: "a", direction: "NIMLOTH", updatedBy: "op" });
    await setDirection(pool, audit, { domain: "anteckning", careUnit: "b", direction: "LEGACY_ONLY", updatedBy: "op" });
    const rows = await listRouting(pool);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.careUnit === "a")?.direction).toBe("NIMLOTH");
  });
});
