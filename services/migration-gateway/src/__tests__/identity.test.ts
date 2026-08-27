// I5 (Spec B4 §5) — identitetsmappningen är explicit, testad,
// granskningsbar; aldrig en tyst null-fallback.

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type pg from "pg";
import { freshTestPool } from "./test-db.js";
import {
  IdentityNotFoundError,
  lookupEhrIdByPatientNo,
  lookupPatientNoByEhrId,
  seedIdentity,
} from "../identity.js";

let pool: pg.Pool;

beforeEach(async () => {
  pool = await freshTestPool();
});

afterAll(async () => {
  await pool?.end();
});

describe("identitetsmappningen (I5)", () => {
  it("slår upp ehr_id från patient_no efter seedning", async () => {
    const ehrId = randomUUID();
    await seedIdentity(pool, { patientNo: "1001", ehrId, careUnit: "vc-lund-norr" });
    await expect(lookupEhrIdByPatientNo(pool, "1001")).resolves.toBe(ehrId);
  });

  it("slår upp patient_no från ehr_id (omvänd riktning)", async () => {
    const ehrId = randomUUID();
    await seedIdentity(pool, { patientNo: "1001", ehrId, careUnit: "vc-lund-norr" });
    await expect(lookupPatientNoByEhrId(pool, ehrId)).resolves.toBe("1001");
  });

  it("FÄLLER: saknad mappning kastar explicit fel, är inte en tyst null (I5)", async () => {
    await expect(lookupEhrIdByPatientNo(pool, "okand-patient")).rejects.toThrow(
      IdentityNotFoundError,
    );
  });

  it("avvisar dubbel patient_no (samma patient kan inte mappas mot två ehr_id via samma patient_no)", async () => {
    const ehrId1 = randomUUID();
    const ehrId2 = randomUUID();
    await seedIdentity(pool, { patientNo: "1001", ehrId: ehrId1, careUnit: "vc-lund-norr" });
    // seedIdentity gör upsert per design (idempotent seedning) — samma
    // patient_no ska peka på den SENAST seedade ehr_id, inte fela.
    await seedIdentity(pool, { patientNo: "1001", ehrId: ehrId2, careUnit: "vc-lund-norr" });
    await expect(lookupEhrIdByPatientNo(pool, "1001")).resolves.toBe(ehrId2);
  });

  it("avvisar samma ehr_id mappad mot två olika patient_no (UNIQUE-constraint)", async () => {
    const ehrId = randomUUID();
    await seedIdentity(pool, { patientNo: "1001", ehrId, careUnit: "vc-lund-norr" });
    await expect(
      pool.query(
        `INSERT INTO legacy_patient_identity (patient_no, ehr_id, care_unit) VALUES ($1, $2, $3)`,
        ["1002", ehrId, "vc-lund-norr"],
      ),
    ).rejects.toThrow();
  });
});
