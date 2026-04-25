// Seed Melior-databasen.
// Kör: pnpm --filter @nimloth-core/test-data seed:melior
//
// Defaults till localhost:5433 (host-access). Override via MELIOR_DB_HOST/PORT.

import { meliorPool } from './db-client.js';
import { ALL_MELIOR_PATIENTS } from './patients.js';
import type { PatientData } from './types.js';
import type pg from 'pg';

async function seedPatient(client: pg.PoolClient, p: PatientData): Promise<number> {
  const result = await client.query<{ patient_id: number }>(
    `INSERT INTO patients (personnummer, fornamn, efternamn, fodelsedatum, kon, adress, postnr, postort, telefon)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING patient_id`,
    [p.personnummer, p.fornamn, p.efternamn, p.fodelsedatum, p.kon, p.adress ?? null, p.postnr ?? null, p.postort ?? null, p.telefon ?? null],
  );
  return result.rows[0].patient_id;
}

async function seedEncounters(
  client: pg.PoolClient,
  patientId: number,
  encounters: NonNullable<PatientData['encounters']>,
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const enc of encounters) {
    const encResult = await client.query<{ encounter_id: number }>(
      `INSERT INTO encounters (patient_id, encounter_type, department_code, department_name,
        admitting_doctor_hsa, admitting_doctor_name, admission_date, discharge_date,
        discharge_diagnosis_icd, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING encounter_id`,
      [
        patientId,
        enc.encounter_type,
        enc.department_code,
        enc.department_name,
        enc.admitting_doctor_hsa ?? null,
        enc.admitting_doctor_name ?? null,
        enc.admission_date,
        enc.discharge_date ?? null,
        enc.discharge_diagnosis_icd ?? null,
        enc.status,
      ],
    );
    const encounterId = encResult.rows[0].encounter_id;
    counts.encounters = (counts.encounters ?? 0) + 1;

    for (const obs of enc.observations ?? []) {
      await client.query(
        `INSERT INTO observations (patient_id, encounter_id, observation_type, value_numeric,
          value_numeric2, unit, recorded_by_hsa, recorded_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [patientId, encounterId, obs.observation_type, obs.value_numeric, obs.value_numeric2 ?? null, obs.unit, obs.recorded_by_hsa ?? null, obs.recorded_at],
      );
      counts.observations = (counts.observations ?? 0) + 1;
    }

    for (const lab of enc.lab_results ?? []) {
      await client.query(
        `INSERT INTO lab_results (patient_id, encounter_id, order_id, analysis_code, analysis_name,
          value_numeric, value_text, unit, reference_low, reference_high, flag,
          ordering_doctor_hsa, lab_system_code, sample_collected_at, result_available_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [
          patientId,
          encounterId,
          lab.order_id ?? null,
          lab.analysis_code,
          lab.analysis_name,
          lab.value_numeric ?? null,
          lab.value_text ?? null,
          lab.unit ?? null,
          lab.reference_low ?? null,
          lab.reference_high ?? null,
          lab.flag ?? null,
          lab.ordering_doctor_hsa ?? null,
          lab.lab_system_code ?? null,
          lab.sample_collected_at ?? null,
          lab.result_available_at ?? null,
        ],
      );
      counts.lab_results = (counts.lab_results ?? 0) + 1;
    }

    for (const rx of enc.prescriptions ?? []) {
      await client.query(
        `INSERT INTO prescriptions (patient_id, encounter_id, drug_name, atc_code, strength, dosage,
          route, frequency, start_date, end_date, prescribing_doctor_hsa, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [patientId, encounterId, rx.drug_name, rx.atc_code, rx.strength, rx.dosage, rx.route, rx.frequency, rx.start_date, rx.end_date ?? null, rx.prescribing_doctor_hsa ?? null, rx.status],
      );
      counts.prescriptions = (counts.prescriptions ?? 0) + 1;
    }

    for (const proc of enc.procedures ?? []) {
      await client.query(
        `INSERT INTO procedures (patient_id, encounter_id, procedure_code_kva, procedure_name,
          laterality, implant_type, implant_manufacturer, implant_model, implant_size,
          performing_surgeon_hsa, performing_surgeon_name, procedure_date, duration_minutes,
          anesthesia_type, complications)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [
          patientId,
          encounterId,
          proc.procedure_code_kva,
          proc.procedure_name,
          proc.laterality ?? null,
          proc.implant_type ?? null,
          proc.implant_manufacturer ?? null,
          proc.implant_model ?? null,
          proc.implant_size ?? null,
          proc.performing_surgeon_hsa ?? null,
          proc.performing_surgeon_name ?? null,
          proc.procedure_date,
          proc.duration_minutes ?? null,
          proc.anesthesia_type ?? null,
          proc.complications ?? null,
        ],
      );
      counts.procedures = (counts.procedures ?? 0) + 1;
    }

    for (const note of enc.clinical_notes ?? []) {
      await client.query(
        `INSERT INTO clinical_notes (patient_id, encounter_id, note_type, department_code,
          author_hsa, author_name, author_role, content, signed, signed_at, cosigned_by_hsa)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          patientId,
          encounterId,
          note.note_type,
          note.department_code ?? null,
          note.author_hsa ?? null,
          note.author_name ?? null,
          note.author_role,
          note.content,
          note.signed ?? false,
          note.signed_at ?? null,
          note.cosigned_by_hsa ?? null,
        ],
      );
      counts.clinical_notes = (counts.clinical_notes ?? 0) + 1;
    }

    for (const dx of enc.diagnoses ?? []) {
      await client.query(
        `INSERT INTO diagnoses (patient_id, encounter_id, icd_code, diagnosis_text, diagnosis_type,
          diagnosed_by_hsa, diagnosed_at, resolved_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [patientId, encounterId, dx.icd_code, dx.diagnosis_text, dx.diagnosis_type, dx.diagnosed_by_hsa ?? null, dx.diagnosed_at, dx.resolved_at ?? null],
      );
      counts.diagnoses = (counts.diagnoses ?? 0) + 1;
    }

    for (const ref of enc.referrals ?? []) {
      await client.query(
        `INSERT INTO referrals (patient_id, from_department, to_department, referral_reason,
          priority, status, referring_doctor_hsa, sent_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [patientId, ref.from_department, ref.to_department, ref.referral_reason, ref.priority, ref.status, ref.referring_doctor_hsa ?? null, ref.sent_at],
      );
      counts.referrals = (counts.referrals ?? 0) + 1;
    }
  }
  return counts;
}

async function seedAllergies(
  client: pg.PoolClient,
  patientId: number,
  allergies: NonNullable<PatientData['allergies']>,
): Promise<number> {
  let count = 0;
  for (const a of allergies) {
    await client.query(
      `INSERT INTO allergies (patient_id, allergen, reaction, severity, verified, reported_by_hsa, reported_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [patientId, a.allergen, a.reaction, a.severity, a.verified ?? false, a.reported_by_hsa ?? null, a.reported_at ?? null],
    );
    count++;
  }
  return count;
}

async function main(): Promise<void> {
  const pool = meliorPool();
  const client = await pool.connect();
  const totals: Record<string, number> = {
    patients: 0,
    encounters: 0,
    observations: 0,
    lab_results: 0,
    prescriptions: 0,
    procedures: 0,
    clinical_notes: 0,
    diagnoses: 0,
    allergies: 0,
    referrals: 0,
  };

  try {
    await client.query('BEGIN');
    // Töm alla tabeller utom instance_metadata.
    console.log('[seed-melior] TRUNCATE CASCADE (behåller instance_metadata)');
    await client.query(`TRUNCATE
      patients, encounters, observations, lab_results, prescriptions,
      procedures, clinical_notes, diagnoses, allergies, referrals
      RESTART IDENTITY CASCADE`);

    for (const patient of ALL_MELIOR_PATIENTS) {
      const patientId = await seedPatient(client, patient);
      totals.patients++;
      if (patient.encounters && patient.encounters.length > 0) {
        const encCounts = await seedEncounters(client, patientId, patient.encounters);
        for (const [k, v] of Object.entries(encCounts)) {
          totals[k] = (totals[k] ?? 0) + v;
        }
      }
      if (patient.allergies && patient.allergies.length > 0) {
        totals.allergies += await seedAllergies(client, patientId, patient.allergies);
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

  console.log('[seed-melior] Klar:');
  for (const [table, count] of Object.entries(totals)) {
    console.log(`  ${table}: ${count}`);
  }
}

main().catch((err) => {
  console.error('[seed-melior] FAILED:', err);
  process.exit(1);
});
