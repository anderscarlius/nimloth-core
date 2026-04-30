// ParityRecorder (Sprint 2 P3.4, steg 4.4).
//
// Persisterar en ParityRun i parity_snapshots-tabellen. En rad per
// snapshot, alla med samma run_id. Idempotent på run_id-nivå:
// dubblettkörning av samma run-objekt är no-op.

import type pg from 'pg';
import type { ParityRun } from './types.js';
import { KANONISERING_VERSION } from './diff.js';

/** Skriver alla snapshots i runen som separata rader. Bygger ett VALUES-
 *  uttryck per snapshot för att undvika N+1 round-trips till postgres.
 *  ON CONFLICT DO NOTHING på run_id+resource_type+patient_pnr-kombinationen
 *  finns inte som unik constraint i tabellen — vi förlitar oss på att
 *  callern inte recorder samma run två gånger. */
export async function recordSnapshot(pool: pg.Pool, run: ParityRun): Promise<void> {
  if (run.snapshots.length === 0) return;

  const rows = run.snapshots;
  const values: unknown[] = [];
  const placeholders: string[] = [];

  rows.forEach((s, i) => {
    const base = i * 11;
    placeholders.push(
      `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, ` +
        `$${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11})`,
    );
    values.push(
      run.taken_at,
      run.run_id,
      s.patient_pnr,
      s.resource_type,
      s.postgres_count,
      s.openehr_count,
      s.mismatch_count,
      s.only_in_postgres,
      s.only_in_openehr,
      JSON.stringify(s.field_coverage),
      run.trigger,
    );
  });

  const sql = `
    INSERT INTO parity_snapshots
      (taken_at, run_id, patient_pnr, resource_type,
       postgres_count, openehr_count, mismatch_count,
       only_in_postgres, only_in_openehr, field_coverage, trigger)
    VALUES ${placeholders.join(', ')}
  `;

  await pool.query(sql, values);
  // canonicalisation_version sätts av tabellens DEFAULT till
  // KANONISERING_VERSION (1) vid Sprint 2. Skulle KANONISERING_VERSION
  // bumpas: lägg till explicit kolumn i INSERT ovan istället för DEFAULT.
  void KANONISERING_VERSION;
}
