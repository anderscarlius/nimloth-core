// B4 Etapp 1 — testar de fyra klassificeringarna i anteckning-diff.ts
// utan att kräva riktiga legacy-sim/EHRbase/gateway-instanser. fetch
// och pg.Pool är stubbade; den skarpa, verkliga körningen finns
// dokumenterad i B4_Etapp1_Legacysim_och_Skuggning_2026-08-19.md.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type pg from "pg";
import { diffAnteckningForPatient } from "../parity/anteckning-diff.js";

function fakePool(shadowRows: Array<{ legacy_note_id: string; status: string; composition_uid: string | null; error_detail: string | null }>): pg.Pool {
  return {
    query: vi.fn().mockResolvedValue({ rows: shadowRows }),
  } as unknown as pg.Pool;
}

const LEGACY_NOTES = [
  { id: "note-1", text: "Text A" },
  { id: "note-2", text: "Text B" },
  { id: "note-3", text: "Text C" },
];

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/notes/by-patient/")) {
        return { json: async () => LEGACY_NOTES } as Response;
      }
      if (url.includes("/query/aql")) {
        // Composition-text-uppslag: styrs per test via en global override.
        return { ok: true, json: async () => (globalThis as any).__aqlResponse } as Response;
      }
      throw new Error(`oväntat fetch-anrop: ${url}`);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("anteckning-diff — de fyra klassificeringarna", () => {
  it("LEGACY_ONLY_NOT_SHADOWED — ingen rad i shadow_write_log", async () => {
    const pool = fakePool([]);
    const result = await diffAnteckningForPatient(
      { legacySimBaseUrl: "http://x", ehrbaseBaseUrl: "http://y", gatewayPool: pool },
      "1001",
      "ehr-1",
    );
    expect(result.summary.LEGACY_ONLY_NOT_SHADOWED).toBe(3);
    expect(result.summary.SHADOW_FAILED).toBe(0);
  });

  it("SHADOW_FAILED — 'kom aldrig fram' (Grind 1-amendemang)", async () => {
    const pool = fakePool([
      { legacy_note_id: "note-1", status: "FAILED", composition_uid: null, error_detail: "EHRbase nere" },
    ]);
    const result = await diffAnteckningForPatient(
      { legacySimBaseUrl: "http://x", ehrbaseBaseUrl: "http://y", gatewayPool: pool },
      "1001",
      "ehr-1",
    );
    expect(result.summary.SHADOW_FAILED).toBe(1);
    const row = result.rows.find((r) => r.legacyNoteId === "note-1");
    expect(row?.classification).toBe("SHADOW_FAILED");
    expect(row?.errorDetail).toBe("EHRbase nere");
  });

  it("SHADOW_SUCCESS_MATCH — kom fram, samma text", async () => {
    (globalThis as any).__aqlResponse = { rows: [["Text A"]] };
    const pool = fakePool([
      { legacy_note_id: "note-1", status: "SUCCESS", composition_uid: "uid-1", error_detail: null },
    ]);
    const result = await diffAnteckningForPatient(
      { legacySimBaseUrl: "http://x", ehrbaseBaseUrl: "http://y", gatewayPool: pool },
      "1001",
      "ehr-1",
    );
    expect(result.summary.SHADOW_SUCCESS_MATCH).toBe(1);
    expect(result.summary.SHADOW_SUCCESS_MISMATCH).toBe(0);
  });

  it("SHADOW_SUCCESS_MISMATCH — 'kom fram och skiljer sig' (Grind 1-amendemang, den skarpa avvikelsen)", async () => {
    (globalThis as any).__aqlResponse = { rows: [["En annan text än originalet"]] };
    const pool = fakePool([
      { legacy_note_id: "note-1", status: "SUCCESS", composition_uid: "uid-1", error_detail: null },
    ]);
    const result = await diffAnteckningForPatient(
      { legacySimBaseUrl: "http://x", ehrbaseBaseUrl: "http://y", gatewayPool: pool },
      "1001",
      "ehr-1",
    );
    expect(result.summary.SHADOW_SUCCESS_MISMATCH).toBe(1);
    expect(result.summary.SHADOW_SUCCESS_MATCH).toBe(0);
    const row = result.rows.find((r) => r.legacyNoteId === "note-1");
    expect(row?.openEhrText).toBe("En annan text än originalet");
  });

  it("blandat fall: alla fyra klassificeringar samtidigt särskiljs korrekt", async () => {
    (globalThis as any).__aqlResponse = { rows: [["Text C"]] };
    const pool = fakePool([
      { legacy_note_id: "note-2", status: "FAILED", composition_uid: null, error_detail: "timeout" },
      { legacy_note_id: "note-3", status: "SUCCESS", composition_uid: "uid-3", error_detail: null },
    ]);
    const result = await diffAnteckningForPatient(
      { legacySimBaseUrl: "http://x", ehrbaseBaseUrl: "http://y", gatewayPool: pool },
      "1001",
      "ehr-1",
    );
    expect(result.summary).toEqual({
      LEGACY_ONLY_NOT_SHADOWED: 1,
      SHADOW_FAILED: 1,
      SHADOW_SUCCESS_MATCH: 1,
      SHADOW_SUCCESS_MISMATCH: 0,
    });
  });
});
