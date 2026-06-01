// Determinism-test för sample(): vi mockar pool.query för att returnera fast
// medlems-lista och verifierar att samma seed → samma urval.

import { describe, expect, it } from 'vitest';
import type pg from 'pg';
import { sample } from '../cohort.js';
import type { CohortDefinitionRow } from '../cohort.js';

const FAKE_DEF: CohortDefinitionRow = {
  cohort_definition_id: 1,
  name: 'fake_cohort',
  description: null,
  definition_sql: 'SELECT 1',
  is_predefined: true,
};

function buildMockPool(members: number[]): pg.Pool {
  // Bygg en minimal mock med rätt rad-shape
  const rows = members.map((id) => ({
    person_id: id,
    person_source_value: `mock-${id}`,
    _source: id < 1_000_000 ? 'live_transform' : 'preloaded',
    cohort_start_date: '2024-06-01',
  }));
  return {
    query: async () => ({ rows }),
  } as unknown as pg.Pool;
}

describe('sample — determinism', () => {
  it('samma seed → identiskt urval', async () => {
    const members = Array.from({ length: 100 }, (_, i) => 1_000_000 + i);
    const pool = buildMockPool(members);
    const a = await sample(pool, FAKE_DEF, 10, 'seed-X');
    const b = await sample(pool, FAKE_DEF, 10, 'seed-X');
    expect(a.members.map((m) => m.person_id)).toEqual(b.members.map((m) => m.person_id));
  });

  it('olika seed → annorlunda urval', async () => {
    const members = Array.from({ length: 200 }, (_, i) => 1_000_000 + i);
    const pool = buildMockPool(members);
    const a = await sample(pool, FAKE_DEF, 10, 'seed-X');
    const b = await sample(pool, FAKE_DEF, 10, 'seed-Y');
    expect(a.members.map((m) => m.person_id)).not.toEqual(b.members.map((m) => m.person_id));
  });

  it('n större än populationen returnerar alla medlemmar', async () => {
    const members = [1, 2, 3];
    const pool = buildMockPool(members);
    const r = await sample(pool, FAKE_DEF, 100, 'seed');
    expect(r.members).toHaveLength(3);
    expect(r.total_size).toBe(3);
  });

  it('tom kohort → tomt urval, ingen exception', async () => {
    const pool = buildMockPool([]);
    const r = await sample(pool, FAKE_DEF, 10, 'seed');
    expect(r.members).toHaveLength(0);
    expect(r.total_size).toBe(0);
    expect(r.n).toBe(0);
  });

  it('_source-uppdelning bevaras i urval', async () => {
    const members = [...Array.from({ length: 50 }, (_, i) => i + 1), ...Array.from({ length: 50 }, (_, i) => 1_000_000 + i)];
    const pool = buildMockPool(members);
    const r = await sample(pool, FAKE_DEF, 100, 'seed');
    const live = r.members.filter((m) => m._source === 'live_transform').length;
    const pre = r.members.filter((m) => m._source === 'preloaded').length;
    expect(live).toBe(50);
    expect(pre).toBe(50);
  });
});
