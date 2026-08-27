// I5 (Spec B4 §5) — identitetsmappningen är explicit, testad,
// granskningsbar. Aldrig en tyst null-fallback: en saknad mappning är
// ett fel, inte ett tomt värde att fortsätta med tyst.

import type pg from "pg";

export interface IdentityRecord {
  patientNo: string;
  ehrId: string;
  careUnit: string;
}

export class IdentityNotFoundError extends Error {
  constructor(public readonly patientNo: string) {
    super(`legacy_patient_identity: ingen mappning för patient_no='${patientNo}'`);
    this.name = "IdentityNotFoundError";
  }
}

export async function seedIdentity(pool: pg.Pool, record: IdentityRecord): Promise<void> {
  await pool.query(
    `INSERT INTO legacy_patient_identity (patient_no, ehr_id, care_unit)
     VALUES ($1, $2, $3)
     ON CONFLICT (patient_no) DO UPDATE SET ehr_id = EXCLUDED.ehr_id, care_unit = EXCLUDED.care_unit`,
    [record.patientNo, record.ehrId, record.careUnit],
  );
}

export async function lookupEhrIdByPatientNo(pool: pg.Pool, patientNo: string): Promise<string> {
  const result = await pool.query(
    `SELECT ehr_id FROM legacy_patient_identity WHERE patient_no = $1`,
    [patientNo],
  );
  if (result.rows.length === 0) {
    throw new IdentityNotFoundError(patientNo);
  }
  return result.rows[0].ehr_id as string;
}

export async function lookupPatientNoByEhrId(pool: pg.Pool, ehrId: string): Promise<string | undefined> {
  const result = await pool.query(
    `SELECT patient_no FROM legacy_patient_identity WHERE ehr_id = $1`,
    [ehrId],
  );
  return result.rows[0]?.patient_no as string | undefined;
}
