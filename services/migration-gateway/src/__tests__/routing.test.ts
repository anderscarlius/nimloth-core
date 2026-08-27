// S5/I3: varje routingändring auditeras. Testet nedan är exakt det S5
// efterfrågar: "ett test som fäller om en routingändring inte auditeras."

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

describe("routingtabellen", () => {
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

  it("listRouting listar alla satta rader", async () => {
    const audit = fakeAudit();
    await setDirection(pool, audit, { domain: "anteckning", careUnit: "a", direction: "SHADOW", updatedBy: "op" });
    await setDirection(pool, audit, { domain: "anteckning", careUnit: "b", direction: "LEGACY_ONLY", updatedBy: "op" });
    const rows = await listRouting(pool);
    expect(rows).toHaveLength(2);
  });
});
