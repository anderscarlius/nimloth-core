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

  // Tidsstämplarna hämtas från Postgres själv (SELECT NOW()), inte från
  // JS-klockan — routing_history.changed_at sätts av databasens NOW(),
  // och en klientklocka som går ur synk med databascontainerns egen
  // klocka (t.ex. Docker-värd vs. container) skulle annars göra testet
  // flakigt av ett skäl som inte har med logiken att göra.
  async function dbNow(): Promise<Date> {
    const result = await pool.query("SELECT NOW() AS now");
    return result.rows[0].now as Date;
  }

  it("auktoritetsproveniens över tid: atTime rekonstruerar vad som gällde vid en given tidpunkt, inte bara nu", async () => {
    const audit = fakeAudit();
    await setDirection(pool, audit, { domain: "anteckning", careUnit: "vc-lund-norr", direction: "SHADOW", updatedBy: "op1" });

    const between = await dbNow();
    await new Promise((r) => setTimeout(r, 10));

    await setDirection(pool, audit, { domain: "anteckning", careUnit: "vc-lund-norr", direction: "NIMLOTH", updatedBy: "op2" });

    expect(await getDirection(pool, "anteckning", "vc-lund-norr", between)).toBe("SHADOW");
    expect(await getDirection(pool, "anteckning", "vc-lund-norr")).toBe("NIMLOTH");
  });

  it("atTime före första ändringen ger DEFAULT_DIRECTION", async () => {
    const before = await dbNow();
    await new Promise((r) => setTimeout(r, 10));
    const audit = fakeAudit();
    await setDirection(pool, audit, { domain: "anteckning", careUnit: "vc-lund-norr", direction: "SHADOW", updatedBy: "op1" });
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
