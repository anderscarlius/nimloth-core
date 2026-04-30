// ParityRecorder-tester (Sprint 2 P3.4, steg 4.9 / AC14).
//
// Använder fake-pool som fångar SQL-strängen + parametrarna. Verifierar
// att rätt INSERT genereras med rätt antal placeholders och rätt
// fält-ordning. CHECK-constraint-rejektion verifierades empiriskt i
// 4.1-sanity-test mot live core-db (P3.4-DAY-0-BASELINE.md noterar det)
// och dupliceras inte här.
//
// Notering om idempotens: recorder.ts saknar ON CONFLICT DO NOTHING
// eftersom (run_id, resource_type, patient_pnr) inte är unik constraint
// i parity_snapshots. Spec accepterade det med kommentar "vi förlitar oss
// på att callern inte recorder samma run två gånger" — den invarianten
// håller eftersom run_id genereras vid varje executeRun().

import { describe, expect, it } from 'vitest';
import type pg from 'pg';
import { recordSnapshot } from '../parity/recorder.js';
import type { ParityRun } from '../parity/types.js';

interface CapturedQuery {
  sql: string;
  params: unknown[];
}

function makeFakePool(): { pool: pg.Pool; queries: CapturedQuery[] } {
  const queries: CapturedQuery[] = [];
  const pool = {
    query: async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params: params ?? [] });
      return { rows: [] };
    },
  } as unknown as pg.Pool;
  return { pool, queries };
}

function makeRun(snapshotCount: number, trigger: 'manual' | 'scheduled' | 'test' = 'manual'): ParityRun {
  return {
    run_id: '00000000-0000-4000-8000-000000000000',
    taken_at: new Date('2026-04-30T12:00:00Z'),
    trigger,
    patient_pnr: '19500315-2384',
    snapshots: Array.from({ length: snapshotCount }, (_, i) => ({
      resource_type: 'Patient' as const,
      patient_pnr: '19500315-2384',
      postgres_count: i,
      openehr_count: i + 1,
      mismatch_count: 1,
      only_in_postgres: [],
      only_in_openehr: ['key-x'],
      field_coverage: { id: { postgres: i, openehr: i + 1 } },
    })),
    failures: [],
  };
}

describe('recordSnapshot', () => {
  it('INSERT med 6 rader producerar 1 query med 66 parametrar (6 rader × 11 fält)', async () => {
    const { pool, queries } = makeFakePool();
    const run = makeRun(6);
    await recordSnapshot(pool, run);
    expect(queries).toHaveLength(1);
    const q = queries[0];
    expect(q.sql).toMatch(/INSERT INTO parity_snapshots/);
    // 6 rader × 11 placeholders = 66 parametrar
    expect(q.params).toHaveLength(66);
    // Sex VALUES-grupper med ($1..$11), ($12..$22), ...
    expect(q.sql).toContain('$1');
    expect(q.sql).toContain('$66');
  });

  it('tomma snapshots ⇒ ingen query (no-op)', async () => {
    const { pool, queries } = makeFakePool();
    const run = makeRun(0);
    await recordSnapshot(pool, run);
    expect(queries).toHaveLength(0);
  });

  it('alla snapshots delar samma run_id i parametrarna', async () => {
    const { pool, queries } = makeFakePool();
    const run = makeRun(3);
    await recordSnapshot(pool, run);
    const params = queries[0].params;
    // run_id ligger på position 1, 12, 23 (varje rads 2:a fält i 11-pack)
    expect(params[1]).toBe(run.run_id);
    expect(params[12]).toBe(run.run_id);
    expect(params[23]).toBe(run.run_id);
  });

  it('field_coverage serialiseras som JSON-string', async () => {
    const { pool, queries } = makeFakePool();
    const run = makeRun(1);
    await recordSnapshot(pool, run);
    const params = queries[0].params;
    // field_coverage ligger på position 9 (0-indexed) i första raden
    const fc = params[9];
    expect(typeof fc).toBe('string');
    expect(JSON.parse(fc as string)).toEqual({ id: { postgres: 0, openehr: 1 } });
  });

  it('trigger-värde flödar oförändrat in i alla rader', async () => {
    for (const trigger of ['manual', 'scheduled', 'test'] as const) {
      const { pool, queries } = makeFakePool();
      const run = makeRun(2, trigger);
      await recordSnapshot(pool, run);
      const params = queries[0].params;
      // trigger ligger på position 10 (0-indexed) i varje rad
      expect(params[10]).toBe(trigger);
      expect(params[21]).toBe(trigger);
    }
  });

  it('only_in_postgres + only_in_openehr passas som arrays (inte serialiserade)', async () => {
    const { pool, queries } = makeFakePool();
    const run = makeRun(1);
    await recordSnapshot(pool, run);
    const params = queries[0].params;
    // only_in_postgres på position 7, only_in_openehr på position 8 (0-indexed)
    expect(Array.isArray(params[7])).toBe(true);
    expect(Array.isArray(params[8])).toBe(true);
    expect(params[8]).toEqual(['key-x']);
  });

  it('SQL inkluderar exakta kolumnnamn som matchar parity_snapshots-schemat', async () => {
    const { pool, queries } = makeFakePool();
    const run = makeRun(1);
    await recordSnapshot(pool, run);
    const sql = queries[0].sql;
    for (const col of [
      'taken_at',
      'run_id',
      'patient_pnr',
      'resource_type',
      'postgres_count',
      'openehr_count',
      'mismatch_count',
      'only_in_postgres',
      'only_in_openehr',
      'field_coverage',
      'trigger',
    ]) {
      expect(sql).toContain(col);
    }
  });
});
