// OMOP-projektor — orkestrerar:
//   1) Slå upp/upsert person från EHRbase ehr_status.
//   2) Hämta medication_summary.v1 via AQL → drug_exposure.
//   3) Hämta laboratory_test_result.v1 via AQL → measurement.
//   4) Stämpla lineage på alla rader.
// Returnerar en ProjectionReport.
//
// INGEN LLM. Idempotent: UNIQUE-constraints på (composition_uid, source_value, datetime)
// gör att rerun INTE skapar dubletter (ON CONFLICT DO NOTHING).

import type { Logger } from 'pino';
import type pg from 'pg';
import type { ProjectorConfig } from './config.js';
import {
  AqlClient,
  aqlEhrForPatient,
  aqlLaboratoryTestResult,
  aqlMedicationSummary,
} from './aql-client.js';
import { mapMedicationSummaryRows } from './mappers/medication.js';
import { mapLaboratoryTestResultRows } from './mappers/measurement.js';
import type { Degradation, ProjectionReport } from './types.js';

export interface ProjectorOptions {
  pool: pg.Pool;
  config: ProjectorConfig;
  logger: Logger;
}

export class OmopProjector {
  private readonly aql: AqlClient;

  constructor(private readonly opts: ProjectorOptions) {
    this.aql = new AqlClient({
      baseUrl: opts.config.ehrbase.baseUrl,
      timeoutMs: opts.config.ehrbase.timeoutMs,
      logger: opts.logger,
    });
  }

  async projectPatient(patientSourceValue: string): Promise<ProjectionReport> {
    const { pool, logger, config } = this.opts;
    const transformVersion = config.transformVersion;
    const degradations: Degradation[] = [];

    logger.info({ patient: patientSourceValue }, 'projektering startad');

    // ----- 1) person --------------------------------------------------------
    const ehrRes = await this.aql.query(aqlEhrForPatient(patientSourceValue));
    if (!ehrRes.rows.length) {
      throw new Error(`Hittade ingen EHR för patient_id=${patientSourceValue}`);
    }
    const [ehrId, subjectId] = ehrRes.rows[0] as [string, string];
    logger.info({ ehrId, subjectId }, 'EHR hittad');

    const personId = await upsertPerson(pool, patientSourceValue, ehrId, transformVersion);

    // ----- 2) drug_exposure -------------------------------------------------
    const medRes = await this.aql.query(aqlMedicationSummary(patientSourceValue));
    const medMap = mapMedicationSummaryRows(patientSourceValue, medRes.rows);
    degradations.push(...medMap.degradations);
    logger.info({ count: medMap.rows.length }, 'medication_summary projekterad');

    for (const row of medMap.rows) {
      await pool.query(
        `INSERT INTO omop.drug_exposure
           (person_id, drug_exposure_start_date, drug_exposure_start_datetime,
            drug_source_value, sig,
            _source_composition_uid, _source_archetype, _transform_version)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (_source_composition_uid, drug_source_value, drug_exposure_start_date) DO NOTHING`,
        [
          personId,
          row.drug_exposure_start_date,
          row.drug_exposure_start_datetime,
          row.drug_source_value,
          row.sig,
          row._source_composition_uid,
          row._source_archetype,
          transformVersion,
        ],
      );
    }

    // ----- 3) measurement (från laboratory_test_result.v1) ------------------
    const labRes = await this.aql.query(aqlLaboratoryTestResult(patientSourceValue));
    const labMap = mapLaboratoryTestResultRows(patientSourceValue, labRes.rows);
    degradations.push(...labMap.degradations);
    logger.info({ count: labMap.rows.length }, 'laboratory_test_result projekterad');

    for (const row of labMap.rows) {
      await pool.query(
        `INSERT INTO omop.measurement
           (person_id, measurement_date, measurement_datetime,
            value_as_number, unit_source_value, measurement_source_value, value_source_value,
            _source_composition_uid, _source_archetype, _transform_version)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (_source_composition_uid, measurement_source_value, measurement_datetime) DO NOTHING`,
        [
          personId,
          row.measurement_date,
          row.measurement_datetime,
          row.value_as_number,
          row.unit_source_value,
          row.measurement_source_value,
          row.value_source_value,
          row._source_composition_uid,
          row._source_archetype,
          transformVersion,
        ],
      );
    }

    // ----- 4) Räkna ostödda källor (vital_signs, problem_diagnosis, ...) ----
    const unsupported = await countUnsupportedSources(this.aql, patientSourceValue);

    // ----- 5) Bygg rapport --------------------------------------------------
    const persistedDrug = await pool.query<{ n: string }>(
      `SELECT COUNT(*) AS n FROM omop.drug_exposure WHERE person_id = $1 AND _transform_version = $2`,
      [personId, transformVersion],
    );
    const persistedMeas = await pool.query<{ n: string }>(
      `SELECT COUNT(*) AS n FROM omop.measurement WHERE person_id = $1 AND _transform_version = $2`,
      [personId, transformVersion],
    );
    const lineage = await pool.query<{ tt: string; uids: string }>(
      `SELECT target_table AS tt, COUNT(DISTINCT _source_composition_uid) AS uids
         FROM omop.v_lineage
         WHERE _transform_version = $1
         GROUP BY target_table`,
      [transformVersion],
    );
    const lineageMap = new Map<string, number>();
    for (const r of lineage.rows) lineageMap.set(r.tt, Number(r.uids));

    return {
      patient_source_value: patientSourceValue,
      ehr_id: ehrId,
      drug_exposure_rows: Number(persistedDrug.rows[0]?.n ?? 0),
      measurement_rows: Number(persistedMeas.rows[0]?.n ?? 0),
      lineage_coverage: {
        drug_exposure_with_uid: lineageMap.get('drug_exposure') ?? 0,
        measurement_with_uid: lineageMap.get('measurement') ?? 0,
        total_uids_seen: (lineageMap.get('drug_exposure') ?? 0) + (lineageMap.get('measurement') ?? 0),
      },
      degradations,
      transform_version: transformVersion,
      unsupported_sources: unsupported,
    };
  }
}

async function upsertPerson(
  pool: pg.Pool,
  sourceValue: string,
  ehrId: string,
  transformVersion: string,
): Promise<number> {
  const res = await pool.query<{ person_id: number }>(
    `INSERT INTO omop.person (person_source_value, _ehr_id, _transform_version)
     VALUES ($1, $2, $3)
     ON CONFLICT (person_source_value) DO UPDATE
       SET _ehr_id = EXCLUDED._ehr_id,
           _transform_version = EXCLUDED._transform_version
     RETURNING person_id`,
    [sourceValue, ehrId, transformVersion],
  );
  return res.rows[0].person_id;
}

/**
 * Räkna kompositions-arketyper som finns för patienten MEN ej projekteras
 * (vital_signs/problem_diagnosis/adverse_reaction_risk/...). Underlag för
 * "unsupported_sources" i rapporten — gör tolerans-degraderingen ärlig.
 */
async function countUnsupportedSources(
  aql: AqlClient,
  patientSourceValue: string,
): Promise<Array<{ archetype: string; count: number; reason: string }>> {
  const q = `SELECT c/archetype_details/template_id/value, COUNT(c/uid/value) FROM EHR e CONTAINS COMPOSITION c WHERE e/ehr_status/subject/external_ref/id/value = '${patientSourceValue.replace(/'/g, "''")}'`;
  const res = await aql.query(q);
  const supported = new Set(['medication_summary.v1', 'laboratory_test_result.v1']);
  const out: Array<{ archetype: string; count: number; reason: string }> = [];
  for (const r of res.rows) {
    const [tplId, count] = r as [string, number];
    if (supported.has(tplId)) continue;
    out.push({
      archetype: tplId,
      count: Number(count),
      reason: reasonFor(tplId),
    });
  }
  return out;
}

function reasonFor(tpl: string): string {
  if (tpl.startsWith('time_series')) {
    return 'vital_signs ligger fortfarande i time_series.en.v1 (fixture). blood_pressure.v2 kräver SDG-10 Fas 2.';
  }
  if (tpl.startsWith('problem_diagnosis')) return 'condition_occurrence är skelett i Del 1 — fylls i Del 2.';
  if (tpl.startsWith('adverse_reaction')) return 'omop.observation eller specifik tabell krävs — ej i Del 1.';
  if (tpl.startsWith('minimal_evaluation') || tpl.startsWith('minimal_action')) {
    return 'minimal-fixtures saknar OMOP-mål; bevarade som källrader i EHRbase.';
  }
  return 'Ingen mapper i Del 1.';
}
