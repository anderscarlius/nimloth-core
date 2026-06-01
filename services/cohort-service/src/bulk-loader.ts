// Bulk-INSERT av syntetiserad bredd via postgres COPY-ish (UNNEST-batch).
// Märker alla rader _source='preloaded'.

import type pg from 'pg';
import type { Logger } from 'pino';
import type {
  BulkGenerated,
  SyntheticDrugExposure,
  SyntheticMeasurement,
  SyntheticPerson,
} from './synthetic.js';

const BATCH = 1000;

export interface LoadReport {
  persons_inserted: number;
  drug_exposure_inserted: number;
  measurement_inserted: number;
  elapsed_ms: number;
}

/**
 * Insertar bulk-data i schema omop med _source='preloaded'.
 * Använder explicita person_id (kringgår BIGSERIAL för stabil rymd).
 * INSERT ON CONFLICT DO NOTHING gör körningen idempotent.
 */
export async function loadBulk(
  pool: pg.Pool,
  data: BulkGenerated,
  logger: Logger,
): Promise<LoadReport> {
  const t0 = Date.now();

  // Person -----------------------------------------------------------------
  let personsInserted = 0;
  for (let i = 0; i < data.persons.length; i += BATCH) {
    const slice = data.persons.slice(i, i + BATCH);
    personsInserted += await insertPersonsBatch(pool, slice);
    if ((i / BATCH) % 5 === 0) logger.info({ done: i + slice.length, of: data.persons.length }, 'persons');
  }

  // Drug exposure ---------------------------------------------------------
  let drugsInserted = 0;
  for (let i = 0; i < data.drugExposures.length; i += BATCH) {
    const slice = data.drugExposures.slice(i, i + BATCH);
    drugsInserted += await insertDrugBatch(pool, slice);
    if ((i / BATCH) % 25 === 0) logger.info({ done: i + slice.length, of: data.drugExposures.length }, 'drug_exposure');
  }

  // Measurement ----------------------------------------------------------
  let measInserted = 0;
  for (let i = 0; i < data.measurements.length; i += BATCH) {
    const slice = data.measurements.slice(i, i + BATCH);
    measInserted += await insertMeasBatch(pool, slice);
    if ((i / BATCH) % 50 === 0) logger.info({ done: i + slice.length, of: data.measurements.length }, 'measurement');
  }

  return {
    persons_inserted: personsInserted,
    drug_exposure_inserted: drugsInserted,
    measurement_inserted: measInserted,
    elapsed_ms: Date.now() - t0,
  };
}

async function insertPersonsBatch(pool: pg.Pool, rows: SyntheticPerson[]): Promise<number> {
  if (!rows.length) return 0;
  // 5 kolumner per rad: person_id, person_source_value, gender_source_value, year_of_birth, _transform_version
  const cols = 5;
  const placeholders: string[] = [];
  const values: unknown[] = [];
  for (let i = 0; i < rows.length; i++) {
    const off = i * cols;
    placeholders.push(`($${off + 1}, $${off + 2}, $${off + 3}, $${off + 4}, $${off + 5}, 'preloaded')`);
    values.push(
      rows[i].person_id,
      rows[i].person_source_value,
      rows[i].gender_source_value,
      rows[i].year_of_birth,
      'synthetic-bulk@0.1.0',
    );
  }
  const sql = `INSERT INTO omop.person
    (person_id, person_source_value, gender_source_value, year_of_birth, _transform_version, _source)
    VALUES ${placeholders.join(', ')}
    ON CONFLICT (person_source_value) DO NOTHING`;
  const res = await pool.query(sql, values);
  return res.rowCount ?? 0;
}

async function insertDrugBatch(pool: pg.Pool, rows: SyntheticDrugExposure[]): Promise<number> {
  if (!rows.length) return 0;
  // 7 kolumner per rad
  const cols = 7;
  const placeholders: string[] = [];
  const values: unknown[] = [];
  for (let i = 0; i < rows.length; i++) {
    const off = i * cols;
    placeholders.push(
      `($${off + 1}, $${off + 2}, $${off + 3}, $${off + 4}, $${off + 5}, $${off + 6}, $${off + 7}, ` +
        `'openEHR-EHR-EVALUATION.medication_summary.v1', 'synthetic-bulk@0.1.0', 'preloaded')`,
    );
    values.push(
      rows[i].person_id,
      rows[i].drug_exposure_start_date,
      rows[i].drug_exposure_start_datetime,
      rows[i].drug_source_value,
      rows[i].sig,
      // _source_composition_uid: stabil syntetisk uid (lineage-anslag)
      `synth:${rows[i].person_id}:${rows[i].drug_source_value}:${rows[i].drug_exposure_start_date}`,
      // drug_exposure_end_date: null
      null,
    );
  }
  const sql = `INSERT INTO omop.drug_exposure
    (person_id, drug_exposure_start_date, drug_exposure_start_datetime,
     drug_source_value, sig, _source_composition_uid, drug_exposure_end_date,
     _source_archetype, _transform_version, _source)
    VALUES ${placeholders.join(', ')}
    ON CONFLICT (_source_composition_uid, drug_source_value, drug_exposure_start_date) DO NOTHING`;
  const res = await pool.query(sql, values);
  return res.rowCount ?? 0;
}

async function insertMeasBatch(pool: pg.Pool, rows: SyntheticMeasurement[]): Promise<number> {
  if (!rows.length) return 0;
  // 7 kolumner per rad
  const cols = 7;
  const placeholders: string[] = [];
  const values: unknown[] = [];
  for (let i = 0; i < rows.length; i++) {
    const off = i * cols;
    placeholders.push(
      `($${off + 1}, $${off + 2}, $${off + 3}, $${off + 4}, $${off + 5}, $${off + 6}, $${off + 7}, ` +
        `'openEHR-EHR-OBSERVATION.laboratory_test_result.v1', 'synthetic-bulk@0.1.0', 'preloaded')`,
    );
    values.push(
      rows[i].person_id,
      rows[i].measurement_date,
      rows[i].measurement_datetime,
      rows[i].value_as_number,
      rows[i].unit_source_value,
      rows[i].measurement_source_value,
      `synth:${rows[i].person_id}:${rows[i].measurement_source_value}:${rows[i].measurement_datetime}`,
    );
  }
  const sql = `INSERT INTO omop.measurement
    (person_id, measurement_date, measurement_datetime,
     value_as_number, unit_source_value, measurement_source_value,
     _source_composition_uid,
     _source_archetype, _transform_version, _source)
    VALUES ${placeholders.join(', ')}
    ON CONFLICT (_source_composition_uid, measurement_source_value, measurement_datetime) DO NOTHING`;
  const res = await pool.query(sql, values);
  return res.rowCount ?? 0;
}
