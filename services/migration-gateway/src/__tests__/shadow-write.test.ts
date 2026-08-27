import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type pg from "pg";
import { freshTestPool } from "./test-db.js";
import { fakeAudit, fakeFailingLegacyClient, fakeLegacyClient, fakeOpenEhrClient } from "./fakes.js";
import {
  writeNote,
  attemptShadowWrite,
  attemptReverseShadowWrite,
  REVERSE_SHADOW_SENTINEL_AUTHOR_SIGN,
} from "../shadow-write.js";
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
      [result.legacyNote!.id],
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

    expect(result.legacyNote!.id).toBeDefined();
    expect(result.shadow?.status).toBe("FAILED");

    const logged = await pool.query(`SELECT status, error_detail FROM shadow_write_log WHERE legacy_note_id = $1`, [
      result.legacyNote!.id,
    ]);
    expect(logged.rows[0].status).toBe("FAILED");
    expect(logged.rows[0].error_detail).toContain("simulerat EHRbase-fel");

    // canonical_store är ändå 'legacy' — legacy skrevs, det är sanningen oavsett skuggan.
    const provenance = await pool.query(`SELECT canonical_store FROM note_provenance WHERE logical_note_id = $1`, [
      result.legacyNote!.id,
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

describe("S2 — NIMLOTH (B4 Etapp 2: Nimloth auktoritativ, legacy skuggas)", () => {
  it("skriver till EHRbase och skuggar till legacy när identitetsmappning finns", async () => {
    const legacy = fakeLegacyClient();
    const openEhr = fakeOpenEhrClient();
    const audit = fakeAudit();
    const ehrId = randomUUID();

    await seedIdentity(pool, { patientNo: "1001", ehrId, careUnit: "vc-lund-norr" });
    await setDirection(pool, audit, { domain: "anteckning", careUnit: "vc-lund-norr", direction: "NIMLOTH", updatedBy: "op" });

    const result = await writeNote(pool, legacy, openEhr, audit, {
      domain: "anteckning",
      patientNo: "1001",
      careUnit: "vc-lund-norr",
      text: "Status: opåverkad.",
      authorSign: "ABCD",
    });

    expect(result.direction).toBe("NIMLOTH");
    expect(result.nimlothNote).toBeDefined();
    expect(result.reverseShadow?.status).toBe("SUCCESS");
    expect(openEhr.calls).toBe(1);

    const provenance = await pool.query(
      `SELECT canonical_store FROM note_provenance WHERE logical_note_id = $1`,
      [result.nimlothNote!.id],
    );
    expect(provenance.rows[0].canonical_store).toBe("openehr");
  });

  it("FÄLLER FÖRE EHRbase-skrivningen om identitetsmappning saknas (I5, samma disciplin som SHADOW)", async () => {
    const legacy = fakeLegacyClient();
    const openEhr = fakeOpenEhrClient();
    const audit = fakeAudit();

    await setDirection(pool, audit, { domain: "anteckning", careUnit: "vc-lund-norr", direction: "NIMLOTH", updatedBy: "op" });

    await expect(
      writeNote(pool, legacy, openEhr, audit, {
        domain: "anteckning",
        patientNo: "okand-patient",
        careUnit: "vc-lund-norr",
        text: "text",
        authorSign: "ABCD",
      }),
    ).rejects.toThrow(IdentityNotFoundError);

    expect(openEhr.calls).toBe(0);
  });

  it("Nimloth förblir auktoritativ (framgång till klienten) även om den omvända skuggskrivningen fallerar", async () => {
    const failingLegacy = fakeFailingLegacyClient();
    const openEhr = fakeOpenEhrClient();
    const audit = fakeAudit();
    const ehrId = randomUUID();

    await seedIdentity(pool, { patientNo: "1001", ehrId, careUnit: "vc-lund-norr" });
    await setDirection(pool, audit, { domain: "anteckning", careUnit: "vc-lund-norr", direction: "NIMLOTH", updatedBy: "op" });

    const result = await writeNote(pool, failingLegacy, openEhr, audit, {
      domain: "anteckning",
      patientNo: "1001",
      careUnit: "vc-lund-norr",
      text: "text",
      authorSign: "ABCD",
    });

    expect(result.nimlothNote).toBeDefined();
    expect(result.reverseShadow?.status).toBe("FAILED");

    const provenance = await pool.query(
      `SELECT canonical_store FROM note_provenance WHERE logical_note_id = $1`,
      [result.nimlothNote!.id],
    );
    expect(provenance.rows[0].canonical_store).toBe("openehr");
  });

  it("avbryter hela operationen om EHRbase-skrivningen fallerar (Nimloth är auktoritativ även vid fel)", async () => {
    const legacy = fakeLegacyClient();
    const failingOpenEhr = fakeOpenEhrClient({ shouldFail: true });
    const audit = fakeAudit();
    const ehrId = randomUUID();

    await seedIdentity(pool, { patientNo: "1001", ehrId, careUnit: "vc-lund-norr" });
    await setDirection(pool, audit, { domain: "anteckning", careUnit: "vc-lund-norr", direction: "NIMLOTH", updatedBy: "op" });

    await expect(
      writeNote(pool, legacy, failingOpenEhr, audit, {
        domain: "anteckning",
        patientNo: "1001",
        careUnit: "vc-lund-norr",
        text: "text",
        authorSign: "ABCD",
      }),
    ).rejects.toThrow();

    const notes = await legacy.getNotesByPatient("1001");
    expect(notes).toHaveLength(0);
  });

  it("Grind 1-amendemang punkt 1: legacy får ALDRIG klientens riktiga signatur/namn — alltid sentinelen", async () => {
    const capturedAuthorSigns: string[] = [];
    const legacy = fakeLegacyClient();
    const originalCreateNote = legacy.createNote.bind(legacy);
    legacy.createNote = async (input) => {
      capturedAuthorSigns.push(input.author_sign);
      return originalCreateNote(input);
    };
    const openEhr = fakeOpenEhrClient();
    const audit = fakeAudit();
    const ehrId = randomUUID();

    await seedIdentity(pool, { patientNo: "1001", ehrId, careUnit: "vc-lund-norr" });
    await setDirection(pool, audit, { domain: "anteckning", careUnit: "vc-lund-norr", direction: "NIMLOTH", updatedBy: "op" });

    await writeNote(pool, legacy, openEhr, audit, {
      domain: "anteckning",
      patientNo: "1001",
      careUnit: "vc-lund-norr",
      text: "text",
      authorSign: "ABCD",
      composerName: "Anna Andersson",
    });

    expect(capturedAuthorSigns).toEqual([REVERSE_SHADOW_SENTINEL_AUTHOR_SIGN]);
    expect(capturedAuthorSigns[0]).not.toBe("ABCD");
  });
});

describe("I4 spegelvänd — idempotens för omvänd skuggskrivning (attemptReverseShadowWrite)", () => {
  it("ett andra försök för samma composition_uid skriver INTE en andra legacy-rad", async () => {
    const legacy = fakeLegacyClient();
    const audit = fakeAudit();
    const note = {
      compositionUid: `${randomUUID()}::local.ehrbase.org::1`,
      voId: randomUUID(),
      ehrId: randomUUID(),
      patientNo: "1001",
      careUnit: "vc-lund-norr",
      text: "text",
      noteCreatedAt: new Date().toISOString(),
    };

    const first = await attemptReverseShadowWrite(pool, legacy, audit, note);
    expect(first.status).toBe("SUCCESS");
    expect((await legacy.getNotesByPatient("1001")).length).toBe(1);

    const second = await attemptReverseShadowWrite(pool, legacy, audit, note);
    expect(second.status).toBe("SKIPPED_ALREADY_ATTEMPTED");
    expect(second.legacyNoteId).toBe(first.legacyNoteId);
    expect((await legacy.getNotesByPatient("1001")).length).toBe(1);
  });

  it("I1 spegelvänd: ett omkört försök gör inget nytt anrop mot legacy alls, oavsett den underliggande radens signeringsstatus", async () => {
    const legacy = fakeLegacyClient();
    const audit = fakeAudit();
    const note = {
      compositionUid: `${randomUUID()}::local.ehrbase.org::1`,
      voId: randomUUID(),
      ehrId: randomUUID(),
      patientNo: "1001",
      careUnit: "vc-lund-norr",
      text: "text",
      noteCreatedAt: new Date().toISOString(),
    };
    let createNoteCalls = 0;
    const originalCreateNote = legacy.createNote.bind(legacy);
    legacy.createNote = async (input) => {
      createNoteCalls++;
      return originalCreateNote(input);
    };

    const first = await attemptReverseShadowWrite(pool, legacy, audit, note);
    // Simulera att en klinker hunnit signera legacy-raden mellan försöken.
    await legacy.getNoteById(first.legacyNoteId as string);

    await attemptReverseShadowWrite(pool, legacy, audit, note);
    expect(createNoteCalls).toBe(1);
  });

  it("ett omkört försök efter ett FAILED-försök hoppas också över", async () => {
    const failingLegacy = fakeFailingLegacyClient();
    const audit = fakeAudit();
    const note = {
      compositionUid: `${randomUUID()}::local.ehrbase.org::1`,
      voId: randomUUID(),
      ehrId: randomUUID(),
      patientNo: "1001",
      careUnit: "vc-lund-norr",
      text: "text",
      noteCreatedAt: new Date().toISOString(),
    };

    const first = await attemptReverseShadowWrite(pool, failingLegacy, audit, note);
    expect(first.status).toBe("FAILED");

    const second = await attemptReverseShadowWrite(pool, failingLegacy, audit, note);
    expect(second.status).toBe("SKIPPED_ALREADY_ATTEMPTED");
  });
});

describe("S5 (B4 Etapp 3) — I1 genom hela S2→S3-återgången", () => {
  it("en S2-skriven, reverse-skuggad post: ett återförsök EFTER att routingen växlat tillbaka till LEGACY_ONLY är fortfarande skyddat — inget nytt legacy-anrop, oavsett riktning som nu gäller", async () => {
    const legacy = fakeLegacyClient();
    const audit = fakeAudit();
    const note = {
      compositionUid: `${randomUUID()}::local.ehrbase.org::1`,
      voId: randomUUID(),
      ehrId: randomUUID(),
      patientNo: "1001",
      careUnit: "vc-lund-norr",
      text: "skriven under S2",
      noteCreatedAt: new Date().toISOString(),
    };

    const duringS2 = await attemptReverseShadowWrite(pool, legacy, audit, note);
    expect(duringS2.status).toBe("SUCCESS");

    // Återgången: routingen pekas tillbaka. Detta ändrar INGET i
    // idempotenskontrollen — den frågar reverse_shadow_write_log, inte
    // routing_history — men S5 kräver att det bevisas explicit för just
    // detta scenario, inte bara antas av symmetri.
    await setDirection(pool, audit, { domain: "anteckning", careUnit: "vc-lund-norr", direction: "LEGACY_ONLY", updatedBy: "revert-operator" });

    const afterS3 = await attemptReverseShadowWrite(pool, legacy, audit, note);
    expect(afterS3.status).toBe("SKIPPED_ALREADY_ATTEMPTED");
    expect(afterS3.legacyNoteId).toBe(duringS2.legacyNoteId);
  });
});
