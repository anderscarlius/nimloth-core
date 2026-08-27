import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type pg from "pg";
import { freshTestPool } from "./test-db.js";
import { fakeAudit, fakeFailingLegacyClient, fakeLegacyClient, fakeOpenEhrClient } from "./fakes.js";
import { writeNote, attemptShadowWrite } from "../shadow-write.js";
import { setDirection } from "../routing.js";
import { seedIdentity } from "../identity.js";
import { IdentityNotFoundError } from "../identity.js";

let pool: pg.Pool;

beforeEach(async () => {
  pool = await freshTestPool();
});

afterAll(async () => {
  await pool?.end();
});

describe("S0 — LEGACY_ONLY (ingen routing satt = default)", () => {
  it("skriver bara till legacy, ingen skuggning försöks", async () => {
    const legacy = fakeLegacyClient();
    const openEhr = fakeOpenEhrClient();
    const audit = fakeAudit();

    const result = await writeNote(pool, legacy, openEhr, audit, {
      domain: "anteckning",
      patientNo: "1001",
      careUnit: "vc-lund-norr",
      text: "Status: opåverkad.",
      authorSign: "ABCD",
    });

    expect(result.direction).toBe("LEGACY_ONLY");
    expect(result.shadow).toBeNull();
    expect(openEhr.calls).toBe(0);

    const provenance = await pool.query(
      `SELECT canonical_store FROM note_provenance WHERE logical_note_id = $1`,
      [result.legacyNote.id],
    );
    expect(provenance.rows[0].canonical_store).toBe("legacy");
  });
});

describe("S1 — SHADOW (legacy auktoritativ, canonical_store satt per post — I2)", () => {
  it("skriver till legacy och skuggar till EHRbase när identitetsmappning finns", async () => {
    const legacy = fakeLegacyClient();
    const openEhr = fakeOpenEhrClient();
    const audit = fakeAudit();
    const ehrId = randomUUID();

    await seedIdentity(pool, { patientNo: "1001", ehrId, careUnit: "vc-lund-norr" });
    await setDirection(pool, audit, { domain: "anteckning", careUnit: "vc-lund-norr", direction: "SHADOW", updatedBy: "op" });

    const result = await writeNote(pool, legacy, openEhr, audit, {
      domain: "anteckning",
      patientNo: "1001",
      careUnit: "vc-lund-norr",
      text: "Status: opåverkad.",
      authorSign: "ABCD",
    });

    expect(result.direction).toBe("SHADOW");
    expect(result.shadow?.status).toBe("SUCCESS");
    expect(result.shadow?.compositionUid).toBeDefined();
    expect(openEhr.calls).toBe(1);
  });

  it("FÄLLER FÖRE legacy-skrivningen om identitetsmappning saknas (ingen tyst fallback, I5)", async () => {
    const legacy = fakeLegacyClient();
    const openEhr = fakeOpenEhrClient();
    const audit = fakeAudit();

    await setDirection(pool, audit, { domain: "anteckning", careUnit: "vc-lund-norr", direction: "SHADOW", updatedBy: "op" });

    await expect(
      writeNote(pool, legacy, openEhr, audit, {
        domain: "anteckning",
        patientNo: "okand-patient",
        careUnit: "vc-lund-norr",
        text: "text",
        authorSign: "ABCD",
      }),
    ).rejects.toThrow(IdentityNotFoundError);

    // Legacy ska INTE ha fått en post — hela operationen avbröts före skrivningen.
    const notes = await legacy.getNotesByPatient("okand-patient");
    expect(notes).toHaveLength(0);
  });

  it("legacy förblir auktoritativ (framgång till klienten) även om skuggskrivningen fallerar", async () => {
    const legacy = fakeLegacyClient();
    const failingOpenEhr = fakeOpenEhrClient({ shouldFail: true });
    const audit = fakeAudit();
    const ehrId = randomUUID();

    await seedIdentity(pool, { patientNo: "1001", ehrId, careUnit: "vc-lund-norr" });
    await setDirection(pool, audit, { domain: "anteckning", careUnit: "vc-lund-norr", direction: "SHADOW", updatedBy: "op" });

    const result = await writeNote(pool, legacy, failingOpenEhr, audit, {
      domain: "anteckning",
      patientNo: "1001",
      careUnit: "vc-lund-norr",
      text: "text",
      authorSign: "ABCD",
    });

    expect(result.legacyNote.id).toBeDefined();
    expect(result.shadow?.status).toBe("FAILED");

    const logged = await pool.query(`SELECT status, error_detail FROM shadow_write_log WHERE legacy_note_id = $1`, [
      result.legacyNote.id,
    ]);
    expect(logged.rows[0].status).toBe("FAILED");
    expect(logged.rows[0].error_detail).toContain("simulerat EHRbase-fel");

    // canonical_store är ändå 'legacy' — legacy skrevs, det är sanningen oavsett skuggan.
    const provenance = await pool.query(`SELECT canonical_store FROM note_provenance WHERE logical_note_id = $1`, [
      result.legacyNote.id,
    ]);
    expect(provenance.rows[0].canonical_store).toBe("legacy");
  });

  it("avbryter hela operationen om legacy-skrivningen fallerar (legacy är auktoritativ även vid fel)", async () => {
    const failingLegacy = fakeFailingLegacyClient();
    const openEhr = fakeOpenEhrClient();
    const audit = fakeAudit();

    await expect(
      writeNote(pool, failingLegacy, openEhr, audit, {
        domain: "anteckning",
        patientNo: "1001",
        careUnit: "vc-lund-norr",
        text: "text",
        authorSign: "ABCD",
      }),
    ).rejects.toThrow();

    expect(openEhr.calls).toBe(0);
  });
});

describe("I4 — idempotens: skuggskrivning kan köras om utan dubblett", () => {
  it("ett andra attemptShadowWrite-anrop för samma legacy-post skriver INTE en andra composition", async () => {
    const openEhr = fakeOpenEhrClient();
    const audit = fakeAudit();
    const ehrId = randomUUID();
    const legacyNote = {
      id: randomUUID(),
      patient_no: "1001",
      care_unit: "vc-lund-norr",
      text: "text",
      author_sign: "ABCD",
      created_at: "2026-08-19 10:00:00",
      signed_at: null,
    };

    const first = await attemptShadowWrite(pool, openEhr, audit, legacyNote, ehrId);
    expect(first.status).toBe("SUCCESS");
    expect(openEhr.calls).toBe(1);

    const second = await attemptShadowWrite(pool, openEhr, audit, legacyNote, ehrId);
    expect(second.status).toBe("SKIPPED_ALREADY_ATTEMPTED");
    expect(second.compositionUid).toBe(first.compositionUid);
    // Inget nytt EHRbase-anrop gjordes — idempotensnyckeln (UNIQUE
    // legacy_note_id i shadow_write_log) höll det borta innan HTTP-anropet.
    expect(openEhr.calls).toBe(1);

    const rows = await pool.query(`SELECT COUNT(*) FROM shadow_write_log WHERE legacy_note_id = $1`, [legacyNote.id]);
    expect(Number(rows.rows[0].count)).toBe(1);
  });

  it("ett omkört försök efter ett FAILED-försök hoppas också över (loggen är facit, inte ett nytt försök)", async () => {
    const failingOpenEhr = fakeOpenEhrClient({ shouldFail: true });
    const audit = fakeAudit();
    const ehrId = randomUUID();
    const legacyNote = {
      id: randomUUID(),
      patient_no: "1001",
      care_unit: "vc-lund-norr",
      text: "text",
      author_sign: "ABCD",
      created_at: "2026-08-19 10:00:00",
      signed_at: null,
    };

    const first = await attemptShadowWrite(pool, failingOpenEhr, audit, legacyNote, ehrId);
    expect(first.status).toBe("FAILED");

    const second = await attemptShadowWrite(pool, failingOpenEhr, audit, legacyNote, ehrId);
    expect(second.status).toBe("SKIPPED_ALREADY_ATTEMPTED");
    expect(failingOpenEhr.calls).toBe(1);
  });
});
