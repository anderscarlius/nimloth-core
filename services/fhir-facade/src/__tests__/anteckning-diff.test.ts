// B4 Etapp 1 — testar de fyra klassificeringarna i anteckning-diff.ts
// utan att kräva riktiga legacy-sim/EHRbase/gateway-instanser. fetch
// och pg.Pool är stubbade; den skarpa, verkliga körningen finns
// dokumenterad i B4_Etapp1_Legacysim_och_Skuggning_2026-08-19.md.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type pg from "pg";
import { diffAnteckningForPatient, diffNimlothOriginatedForEhr } from "../parity/anteckning-diff.js";

function fakePool(shadowRows: Array<{ legacy_note_id: string; status: string; composition_uid: string | null; error_detail: string | null }>): pg.Pool {
  return {
    query: vi.fn().mockResolvedValue({ rows: shadowRows }),
  } as unknown as pg.Pool;
}

// G4: shadow_write_log och reverse_shadow_write_log är två olika
// frågor mot samma pool — behöver kunna svara olika på var och en.
function fakePoolWithReverse(
  shadowRows: Array<{ legacy_note_id: string; status: string; composition_uid: string | null; error_detail: string | null }>,
  reverseShadowedLegacyIds: string[],
): pg.Pool {
  return {
    query: vi.fn().mockImplementation(async (sql: string) => {
      if (sql.includes("reverse_shadow_write_log")) {
        return { rows: reverseShadowedLegacyIds.map((id) => ({ legacy_note_id: id })) };
      }
      return { rows: shadowRows };
    }),
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

  it("blandat fall: alla klassificeringar samtidigt särskiljs korrekt", async () => {
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
      REVERSE_SHADOWED_SEE_MIRROR: 0,
      SHADOW_FAILED: 1,
      SHADOW_SUCCESS_MATCH: 1,
      SHADOW_SUCCESS_MISMATCH: 0,
    });
  });

  it("REVERSE_SHADOWED_SEE_MIRROR — G4: ingen framåtrad, men skriven av gatewayen i motsatt riktning", async () => {
    const pool = fakePoolWithReverse([], ["note-1"]);
    const result = await diffAnteckningForPatient(
      { legacySimBaseUrl: "http://x", ehrbaseBaseUrl: "http://y", gatewayPool: pool },
      "1001",
      "ehr-1",
    );
    expect(result.summary).toEqual({
      LEGACY_ONLY_NOT_SHADOWED: 2,
      REVERSE_SHADOWED_SEE_MIRROR: 1,
      SHADOW_FAILED: 0,
      SHADOW_SUCCESS_MATCH: 0,
      SHADOW_SUCCESS_MISMATCH: 0,
    });
    const row = result.rows.find((r) => r.legacyNoteId === "note-1");
    expect(row?.classification).toBe("REVERSE_SHADOWED_SEE_MIRROR");
  });
});

// B4 Etapp 2 — spegelbilden: Nimloth-födda anteckningar (S2), diffade
// mot legacy via reverse_shadow_write_log. Ingen AQL denna gång —
// note_text är denormaliserad i loggen (se migration-gatewayens
// migrations/006-kommentar).
function fakeGatewayPoolForReverse(
  logRows: Array<{ vo_id: string; note_text: string; legacy_note_id: string | null; status: string }>,
): pg.Pool {
  return {
    query: vi.fn().mockResolvedValue({ rows: logRows }),
  } as unknown as pg.Pool;
}

describe("anteckning-diff — Nimloth-födda anteckningar (S2)", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/notes/legacy-note-match")) {
          return { status: 200, json: async () => ({ text: "Text A" }) } as Response;
        }
        if (url.includes("/notes/legacy-note-mismatch")) {
          return { status: 200, json: async () => ({ text: "En annan text i legacy" }) } as Response;
        }
        throw new Error(`oväntat fetch-anrop: ${url}`);
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("NIMLOTH_ONLY_NOT_SHADOWED — FAILED-post, aldrig kommit fram till legacy", async () => {
    const pool = fakeGatewayPoolForReverse([
      { vo_id: "vo-1", note_text: "text", legacy_note_id: null, status: "FAILED" },
    ]);
    const result = await diffNimlothOriginatedForEhr({ legacySimBaseUrl: "http://x", gatewayPool: pool }, "ehr-1");
    expect(result.summary.NIMLOTH_ONLY_NOT_SHADOWED).toBe(1);
    expect(result.rows[0].legacyText).toBeNull();
  });

  it("REVERSE_SHADOW_SUCCESS_MATCH — kom fram, samma text som i legacy", async () => {
    const pool = fakeGatewayPoolForReverse([
      { vo_id: "vo-1", note_text: "Text A", legacy_note_id: "legacy-note-match", status: "SUCCESS" },
    ]);
    const result = await diffNimlothOriginatedForEhr({ legacySimBaseUrl: "http://x", gatewayPool: pool }, "ehr-1");
    expect(result.summary.REVERSE_SHADOW_SUCCESS_MATCH).toBe(1);
    expect(result.summary.REVERSE_SHADOW_SUCCESS_MISMATCH).toBe(0);
  });

  it("REVERSE_SHADOW_SUCCESS_MISMATCH — kom fram, men skiljer sig från legacy", async () => {
    const pool = fakeGatewayPoolForReverse([
      { vo_id: "vo-1", note_text: "Text A", legacy_note_id: "legacy-note-mismatch", status: "SUCCESS" },
    ]);
    const result = await diffNimlothOriginatedForEhr({ legacySimBaseUrl: "http://x", gatewayPool: pool }, "ehr-1");
    expect(result.summary.REVERSE_SHADOW_SUCCESS_MISMATCH).toBe(1);
    expect(result.rows[0].legacyText).toBe("En annan text i legacy");
  });

  it("blandat fall: alla tre klassificeringar särskiljs korrekt", async () => {
    const pool = fakeGatewayPoolForReverse([
      { vo_id: "vo-1", note_text: "text", legacy_note_id: null, status: "FAILED" },
      { vo_id: "vo-2", note_text: "Text A", legacy_note_id: "legacy-note-match", status: "SUCCESS" },
      { vo_id: "vo-3", note_text: "Text A", legacy_note_id: "legacy-note-mismatch", status: "SUCCESS" },
    ]);
    const result = await diffNimlothOriginatedForEhr({ legacySimBaseUrl: "http://x", gatewayPool: pool }, "ehr-1");
    expect(result.summary).toEqual({
      NIMLOTH_ONLY_NOT_SHADOWED: 1,
      REVERSE_SHADOW_SUCCESS_MATCH: 1,
      REVERSE_SHADOW_SUCCESS_MISMATCH: 1,
    });
  });
});
