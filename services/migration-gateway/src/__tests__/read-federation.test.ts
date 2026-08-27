// Grind 1 fynd i, del 1: en ren legacy-läsning skulle tyst utelämna en
// Nimloth-född anteckning vars omvända skuggskrivning fallerat — den
// finns då inte i legacy alls. Detta bryter A5 ("samma anteckning
// läsbar... i samma vy"). Dessa tester bevisar att den sammanslagna
// vyn håller ihop.
//
// Fas B steg 6 (medvetet framkallad SHADOW_FAILED, live) avslöjade ett
// verkligt fel som INTE fångades av de ursprungliga testerna nedan: när
// legacy-sim är helt nere (inte bara "denna post finns inte") kraschade
// den ursprungliga implementationen med ett okatchat fetch-fel — precis
// i det scenario A5 är till för att täcka. "legacyOtillganglig"-testerna
// nedan lades till EFTER det fyndet, inte innan.

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type pg from "pg";
import { freshTestPool } from "./test-db.js";
import { fakeLegacyClient } from "./fakes.js";
import { seedIdentity } from "../identity.js";
import { getNoteByIdMerged, getNotesByPatientMerged, LegacyUnavailableError } from "../read-federation.js";
import type { LegacyClient } from "../legacy-client.js";

let pool: pg.Pool;

beforeEach(async () => {
  pool = await freshTestPool();
});

afterAll(async () => {
  await pool?.end();
});

function fakeUnreachableLegacyClient(): LegacyClient {
  return {
    async createNote() {
      throw new Error("fetch failed");
    },
    async getNotesByPatient() {
      throw new Error("fetch failed");
    },
    async getNoteById() {
      throw new Error("fetch failed");
    },
  };
}

async function insertPendingShadowNote(ehrId: string, voId: string, text: string): Promise<void> {
  await pool.query(
    `INSERT INTO reverse_shadow_write_log
       (composition_uid, vo_id, ehr_id, patient_no, care_unit, note_text, note_created_at, status, duration_ms)
     VALUES ($1, $2, $3, '1001', 'vc-lund-norr', $4, NOW(), 'FAILED', 5)`,
    [`${voId}::local.ehrbase.org::1`, voId, ehrId, text],
  );
}

describe("getNotesByPatientMerged", () => {
  it("utan identitetsmappning: bara legacy:s lista, inget fel", async () => {
    const legacy: LegacyClient = fakeLegacyClient();
    await legacy.createNote({ patient_no: "1001", care_unit: "vc-lund-norr", text: "a", author_sign: "ANCA" });

    const merged = await getNotesByPatientMerged(pool, legacy, "1001");
    expect(merged.legacyUnavailable).toBe(false);
    expect(merged.notes).toHaveLength(1);
    expect(merged.notes[0].source).toBe("legacy");
  });

  it("med en FAILED omvänd skuggskrivning: den Nimloth-födda posten syns ändå, taggad", async () => {
    const legacy: LegacyClient = fakeLegacyClient();
    const ehrId = randomUUID();
    const voId = randomUUID();
    await seedIdentity(pool, { patientNo: "1001", ehrId, careUnit: "vc-lund-norr" });
    await legacy.createNote({ patient_no: "1001", care_unit: "vc-lund-norr", text: "legacy-född", author_sign: "ANCA" });
    await insertPendingShadowNote(ehrId, voId, "nimloth-född, ej skuggad än");

    const merged = await getNotesByPatientMerged(pool, legacy, "1001");
    expect(merged.notes).toHaveLength(2);
    const pending = merged.notes.find((n) => n.source === "openehr_pending_shadow");
    expect(pending?.id).toBe(voId);
    expect(pending?.text).toBe("nimloth-född, ej skuggad än");
    expect(pending?.author_sign).toBeNull();
  });

  it("en SUCCESS-skuggad post dyker INTE upp dubbelt (den finns redan i legacy:s egen lista)", async () => {
    const legacy: LegacyClient = fakeLegacyClient();
    const ehrId = randomUUID();
    await seedIdentity(pool, { patientNo: "1001", ehrId, careUnit: "vc-lund-norr" });
    const legacyNote = await legacy.createNote({ patient_no: "1001", care_unit: "vc-lund-norr", text: "a", author_sign: "ANCA" });
    await pool.query(
      `INSERT INTO reverse_shadow_write_log
         (composition_uid, vo_id, ehr_id, patient_no, care_unit, note_text, note_created_at, legacy_note_id, status, duration_ms)
       VALUES ($1, $2, $3, '1001', 'vc-lund-norr', 'a', NOW(), $4, 'SUCCESS', 50)`,
      [`${randomUUID()}::local.ehrbase.org::1`, randomUUID(), ehrId, legacyNote.id],
    );

    const merged = await getNotesByPatientMerged(pool, legacy, "1001");
    expect(merged.notes).toHaveLength(1);
  });

  it("legacy helt nere: degraderar (legacyUnavailable=true) i stället för att krascha, pending-poster syns ändå", async () => {
    const unreachable = fakeUnreachableLegacyClient();
    const ehrId = randomUUID();
    const voId = randomUUID();
    await seedIdentity(pool, { patientNo: "1001", ehrId, careUnit: "vc-lund-norr" });
    await insertPendingShadowNote(ehrId, voId, "text under avbrott");

    const merged = await getNotesByPatientMerged(pool, unreachable, "1001");
    expect(merged.legacyUnavailable).toBe(true);
    expect(merged.notes).toHaveLength(1);
    expect(merged.notes[0].source).toBe("openehr_pending_shadow");
  });
});

describe("getNoteByIdMerged", () => {
  it("hittar en legacy-post via dess legacy-id", async () => {
    const legacy: LegacyClient = fakeLegacyClient();
    const legacyNote = await legacy.createNote({ patient_no: "1001", care_unit: "vc-lund-norr", text: "a", author_sign: "ANCA" });
    const found = await getNoteByIdMerged(pool, legacy, legacyNote.id);
    expect(found?.source).toBe("legacy");
  });

  it("hittar en pending-shadow-post via dess vo_id när legacy 404:ar", async () => {
    const legacy: LegacyClient = fakeLegacyClient();
    const ehrId = randomUUID();
    const voId = randomUUID();
    await insertPendingShadowNote(ehrId, voId, "text");
    const found = await getNoteByIdMerged(pool, legacy, voId);
    expect(found?.source).toBe("openehr_pending_shadow");
    expect(found?.text).toBe("text");
  });

  it("okänt id ger undefined", async () => {
    const legacy: LegacyClient = fakeLegacyClient();
    const found = await getNoteByIdMerged(pool, legacy, randomUUID());
    expect(found).toBeUndefined();
  });

  it("hittar en pending-shadow-post ÄVEN när legacy är helt nere, inte bara när den 404:ar", async () => {
    const unreachable = fakeUnreachableLegacyClient();
    const ehrId = randomUUID();
    const voId = randomUUID();
    await insertPendingShadowNote(ehrId, voId, "text under avbrott");
    const found = await getNoteByIdMerged(pool, unreachable, voId);
    expect(found?.source).toBe("openehr_pending_shadow");
  });

  it("FÄLLER (kastar LegacyUnavailableError) i stället för att påstå 404 när legacy är nere och posten inte finns i väntlistan", async () => {
    const unreachable = fakeUnreachableLegacyClient();
    await expect(getNoteByIdMerged(pool, unreachable, randomUUID())).rejects.toThrow(LegacyUnavailableError);
  });
});
