// Seed AsynjaVisph-databasen.
// Kör: pnpm --filter @nimloth-core/test-data seed:asynja

import { asynjaPool } from './db-client.js';
import { ALL_ASYNJA_PATIENTS } from './patients.js';
import type { AsynjaPatientData } from './types.js';
import type pg from 'pg';

async function seedPatient(client: pg.PoolClient, p: AsynjaPatientData): Promise<number> {
  const result = await client.query<{ patient_id: number }>(
    `INSERT INTO patients (personnummer, fornamn, efternamn, fodelsedatum, kon, adress, postnr, postort, telefon)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING patient_id`,
    [p.personnummer, p.fornamn, p.efternamn, p.fodelsedatum, p.kon, p.adress ?? null, p.postnr ?? null, p.postort ?? null, p.telefon ?? null],
  );
  return result.rows[0].patient_id;
}

async function main(): Promise<void> {
  const pool = asynjaPool();
  const client = await pool.connect();
  const totals: Record<string, number> = {
    patients: 0,
    encounters: 0,
    prescriptions: 0,
    diagnoses: 0,
    allergies: 0,
  };

  try {
    await client.query('BEGIN');
    console.log('[seed-asynja] TRUNCATE CASCADE');
    await client.query(`TRUNCATE patients, encounters, prescriptions, diagnoses, allergies RESTART IDENTITY CASCADE`);

    for (const patient of ALL_ASYNJA_PATIENTS) {
      const patientId = await seedPatient(client, patient);
      totals.patients++;

      for (const enc of patient.encounters ?? []) {
        await client.query(
          `INSERT INTO encounters (patient_id, visit_type, clinic_code, clinic_name,
            visit_doctor_hsa, visit_doctor_name, visit_date, visit_reason, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            patientId,
            enc.visit_type ?? 'OUTPATIENT',
            enc.clinic_code,
            enc.clinic_name,
            enc.visit_doctor_hsa ?? null,
            enc.visit_doctor_name ?? null,
            enc.visit_date,
            enc.visit_reason ?? null,
            enc.status ?? 'COMPLETED',
          ],
        );
        totals.encounters++;
      }

      for (const rx of patient.prescriptions ?? []) {
        await client.query(
          `INSERT INTO prescriptions (patient_id, drug_name, atc_code, strength, dosage, route,
            frequency, start_date, end_date, prescribing_doctor_hsa, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [patientId, rx.drug_name, rx.atc_code, rx.strength, rx.dosage, rx.route, rx.frequency, rx.start_date, rx.end_date ?? null, rx.prescribing_doctor_hsa ?? null, rx.status],
        );
        totals.prescriptions++;
      }

      for (const dx of patient.diagnoses ?? []) {
        await client.query(
          `INSERT INTO diagnoses (patient_id, icd_code, diagnosis_text, diagnosis_type,
            diagnosed_by_hsa, diagnosed_at)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [patientId, dx.icd_code, dx.diagnosis_text, dx.diagnosis_type, dx.diagnosed_by_hsa ?? null, dx.diagnosed_at],
        );
        totals.diagnoses++;
      }

      for (const a of patient.allergies ?? []) {
        await client.query(
          `INSERT INTO allergies (patient_id, allergen, reaction, severity, verified, reported_by_hsa, reported_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [patientId, a.allergen, a.reaction, a.severity, a.verified ?? false, a.reported_by_hsa ?? null, a.reported_at ?? null],
        );
        totals.allergies++;
      }

      console.log(`  + ${patient.fornamn} ${patient.efternamn} (${patient.personnummer}) — id ${patientId}`);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }

  console.log('[seed-asynja] Klar:');
  for (const [table, count] of Object.entries(totals)) {
    console.log(`  ${table}: ${count}`);
  }
}

main().catch((err) => {
  console.error('[seed-asynja] FAILED:', err);
  process.exit(1);
});
