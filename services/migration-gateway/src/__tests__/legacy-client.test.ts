// B7 (2026-08-28) — legacy-client.ts:s riktiga HTTP-implementation hade
// ALDRIG testats direkt; bara dess fejk (fakes.ts) användes i
// shadow-write.test.ts. Fejken kastar LegacyWriteError direkt och kunde
// därför strukturellt aldrig avslöja detta: ett rått nätverksfel
// (ECONNREFUSED) i den RIKTIGA fetch()-anropet var INTE en
// LegacyWriteError och kraschade hela Node-processen (Express 4 fångar
// inte en unhandled rejection i en async route-handler). Hittat live,
// genom att faktiskt stänga av legacy-sim under ett skrivförsök — samma
// disciplin som S4/S10 i B4-etapperna, nu tillämpad på klientkoden själv.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLegacyClient, LegacyWriteError } from "../legacy-client.js";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createLegacyClient — createNote mot ett rått nätverksfel", () => {
  it("kastar LegacyWriteError(status=0), INTE det råa fetch-felet — annars kraschar hela processen (upptäckt live)", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new TypeError("fetch failed"));
    const client = createLegacyClient("http://unreachable:11601");

    await expect(
      client.createNote({ patient_no: "1001", care_unit: "vc-lund-norr", text: "t", author_sign: "TEST" }),
    ).rejects.toBeInstanceOf(LegacyWriteError);

    try {
      await client.createNote({ patient_no: "1001", care_unit: "vc-lund-norr", text: "t", author_sign: "TEST" });
    } catch (err) {
      expect(err).toBeInstanceOf(LegacyWriteError);
      expect((err as LegacyWriteError).status).toBe(0);
    }
  });

  it("en lyckad skrivning (201) fungerar oförändrat", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: 201,
      json: async () => ({ id: "abc", patient_no: "1001", care_unit: "vc-lund-norr", text: "t", author_sign: "TEST", created_at: "now", signed_at: null }),
    });
    const client = createLegacyClient("http://legacy-sim:11601");
    const note = await client.createNote({ patient_no: "1001", care_unit: "vc-lund-norr", text: "t", author_sign: "TEST" });
    expect(note.id).toBe("abc");
  });

  it("ett avvisat svar (t.ex. 400) ger fortfarande LegacyWriteError med rätt status", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: 400,
      json: async () => ({ fel: "ogiltig-post" }),
    });
    const client = createLegacyClient("http://legacy-sim:11601");
    await expect(
      client.createNote({ patient_no: "1001", care_unit: "vc-lund-norr", text: "t", author_sign: "TEST" }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
