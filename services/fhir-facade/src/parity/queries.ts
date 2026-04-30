// Read-helpers för parity_snapshots-tabellen (Sprint 2 P3.4, steg 4.5).
//
// /latest och /history-endpoints går genom dessa funktioner.
// Recorder skriver, queries läser — separation gör det enkelt att testa
// båda halvor isolerat.

import type pg from 'pg';
import type { ParitySnapshot, ResourceType } from './types.js';

interface ParitySnapshotRow {
  taken_at: Date;
  run_id: string;
  patient_pnr: string | null;
  resource_type: string;
  postgres_count: number;
  openehr_count: number;
  mismatch_count: number;
  only_in_postgres: string[] | null;
  only_in_openehr: string[] | null;
  field_coverage: Record<string, { postgres: number; openehr: number }> | null;
  trigger: string;
  canonicalisation_version: number;
}

export interface ParitySnapshotRecord extends ParitySnapshot {
  taken_at: string;
  run_id: string;
  trigger: string;
  canonicalisation_version: number;
}

function rowToRecord(row: ParitySnapshotRow): ParitySnapshotRecord {
  return {
    taken_at: row.taken_at.toISOString(),
    run_id: row.run_id,
    patient_pnr: row.patient_pnr ?? '',
    resource_type: row.resource_type as ResourceType,
    postgres_count: row.postgres_count,
    openehr_count: row.openehr_count,
    mismatch_count: row.mismatch_count,
    only_in_postgres: row.only_in_postgres ?? [],
    only_in_openehr: row.only_in_openehr ?? [],
    field_coverage: row.field_coverage ?? {},
    trigger: row.trigger,
    canonicalisation_version: row.canonicalisation_version,
  };
}

/** Returnerar senaste rad per resource_type (för en patient om angiven,
 *  annars över alla patienter — använder DISTINCT ON). */
export async function selectLatest(
  pool: pg.Pool,
  patientPnr?: string,
): Promise<ParitySnapshotRecord[]> {
  const sql = patientPnr
    ? `SELECT DISTINCT ON (resource_type) *
       FROM parity_snapshots
       WHERE patient_pnr = $1
       ORDER BY resource_type, taken_at DESC`
    : `SELECT DISTINCT ON (resource_type) *
       FROM parity_snapshots
       ORDER BY resource_type, taken_at DESC`;
  const r = await pool.query<ParitySnapshotRow>(sql, patientPnr ? [patientPnr] : []);
  return r.rows.map(rowToRecord);
}

/** Returnerar de N senaste raderna sorterade fallande på taken_at.
 *  N gäller TOTALT antal rader, inte per resurstyp — caller kan
 *  multiplicera limit med 6 om en gruppering per resurstyp önskas. */
export async function selectHistory(
  pool: pg.Pool,
  limit: number,
  patientPnr?: string,
): Promise<ParitySnapshotRecord[]> {
  const sql = patientPnr
    ? `SELECT * FROM parity_snapshots
       WHERE patient_pnr = $1
       ORDER BY taken_at DESC LIMIT $2`
    : `SELECT * FROM parity_snapshots
       ORDER BY taken_at DESC LIMIT $1`;
  const r = await pool.query<ParitySnapshotRow>(
    sql,
    patientPnr ? [patientPnr, limit] : [limit],
  );
  return r.rows.map(rowToRecord);
}
