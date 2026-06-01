// Kohort-logik: instantiera definition → fyll cohort, sampla deterministiskt.

import type pg from 'pg';
import seedrandom from 'seedrandom';

export interface CohortDefinitionRow {
  cohort_definition_id: number;
  name: string;
  description: string | null;
  definition_sql: string;
  is_predefined: boolean;
}

export interface CohortMember {
  subject_id: number;
  cohort_start_date: string;
}

export interface InstantiateResult {
  cohort_definition_id: number;
  name: string;
  members_inserted: number;
  total_size: number;
  source_split: {
    live_transform: number;
    preloaded: number;
  };
  elapsed_ms: number;
}

export interface SampleResult {
  cohort_definition_id: number;
  seed: string;
  n: number;
  total_size: number;
  members: Array<{
    person_id: number;
    person_source_value: string;
    _source: 'live_transform' | 'preloaded';
    cohort_start_date: string;
  }>;
}

/** Hämta cohort_definition (namn eller id). */
export async function findDefinition(
  pool: pg.Pool,
  identifier: string | number,
): Promise<CohortDefinitionRow | null> {
  const byId = typeof identifier === 'number' || /^\d+$/.test(String(identifier));
  const sql = byId
    ? `SELECT * FROM cohort.cohort_definition WHERE cohort_definition_id = $1`
    : `SELECT * FROM cohort.cohort_definition WHERE name = $1`;
  const res = await pool.query<CohortDefinitionRow>(sql, [identifier]);
  return res.rows[0] ?? null;
}

/** Lista alla definitioner. */
export async function listDefinitions(pool: pg.Pool): Promise<CohortDefinitionRow[]> {
  const res = await pool.query<CohortDefinitionRow>(
    `SELECT * FROM cohort.cohort_definition ORDER BY is_predefined DESC, cohort_definition_id`,
  );
  return res.rows;
}

/**
 * Instantiera en kohort:
 *   1) Kör definition_sql → en lista (subject_id, cohort_start_date)
 *   2) Truncata befintliga medlemmar för denna definition
 *   3) Insertar resultatet
 *   4) Returnerar storlek + source-uppdelning
 *
 * AC1: Idempotent — samma definition + samma underliggande data → samma resultat.
 */
export async function instantiate(
  pool: pg.Pool,
  def: CohortDefinitionRow,
): Promise<InstantiateResult> {
  const t0 = Date.now();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Bygg definition_sql till en select-statment + insert-into-cohort
    const insertSql = `
      WITH defquery AS (
        ${def.definition_sql}
      )
      INSERT INTO cohort.cohort (cohort_definition_id, subject_id, cohort_start_date)
      SELECT $1, subject_id, cohort_start_date FROM defquery
      ON CONFLICT (cohort_definition_id, subject_id, cohort_start_date) DO NOTHING
    `;

    // Truncata gamla medlemmar för en ren instantiering
    await client.query(`DELETE FROM cohort.cohort WHERE cohort_definition_id = $1`, [
      def.cohort_definition_id,
    ]);
    const inserted = await client.query(insertSql, [def.cohort_definition_id]);

    // Hämta storlek + source-uppdelning
    const sizeRes = await client.query<{ n: string }>(
      `SELECT COUNT(*) AS n FROM cohort.cohort WHERE cohort_definition_id = $1`,
      [def.cohort_definition_id],
    );
    const split = await client.query<{ _source: string; n: string }>(
      `SELECT p._source, COUNT(*) AS n
         FROM cohort.cohort c
         JOIN omop.person p ON p.person_id = c.subject_id
         WHERE c.cohort_definition_id = $1
         GROUP BY p._source`,
      [def.cohort_definition_id],
    );
    const live = Number(split.rows.find((r) => r._source === 'live_transform')?.n ?? 0);
    const pre = Number(split.rows.find((r) => r._source === 'preloaded')?.n ?? 0);

    await client.query('COMMIT');
    return {
      cohort_definition_id: def.cohort_definition_id,
      name: def.name,
      members_inserted: inserted.rowCount ?? 0,
      total_size: Number(sizeRes.rows[0].n),
      source_split: { live_transform: live, preloaded: pre },
      elapsed_ms: Date.now() - t0,
    };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Deterministisk Fisher-Yates-baserad sampling.
 *
 * AC2: sample?seed=X → identiskt urval vid upprepad körning.
 * Vi sorterar medlemmar deterministiskt (subject_id ASC) innan vi blandar med
 * den seedade PRNG:n. Det innebär att INPUT-ordningen från DB inte påverkar
 * resultatet — bara seed + cohort-medlemskap gör det.
 */
export async function sample(
  pool: pg.Pool,
  def: CohortDefinitionRow,
  n: number,
  seed: string,
): Promise<SampleResult> {
  const members = await pool.query<{
    person_id: number;
    person_source_value: string;
    _source: 'live_transform' | 'preloaded';
    cohort_start_date: string;
  }>(
    `SELECT p.person_id, p.person_source_value, p._source, c.cohort_start_date::text AS cohort_start_date
       FROM cohort.cohort c
       JOIN omop.person p ON p.person_id = c.subject_id
       WHERE c.cohort_definition_id = $1
       ORDER BY p.person_id ASC`,
    [def.cohort_definition_id],
  );

  const all = members.rows;
  const k = Math.min(n, all.length);
  if (k === 0) {
    return {
      cohort_definition_id: def.cohort_definition_id,
      seed,
      n: 0,
      total_size: 0,
      members: [],
    };
  }

  // Fisher-Yates med seedrandom PRNG.
  const rng = seedrandom(seed);
  const arr = all.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return {
    cohort_definition_id: def.cohort_definition_id,
    seed,
    n: k,
    total_size: all.length,
    members: arr.slice(0, k),
  };
}
