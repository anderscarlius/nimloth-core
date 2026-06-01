import { describe, expect, it } from 'vitest';
import { generateBulk } from '../synthetic.js';

const SEED = 'unit-test-seed-42';

describe('generateBulk — determinism', () => {
  it('samma seed + samma size → IDENTISKT output', () => {
    const a = generateBulk({
      size: 50,
      personIdOffset: 1_000_000,
      masterSeed: SEED,
      dateFrom: '2024-01-01',
      dateTo: '2024-12-31',
    });
    const b = generateBulk({
      size: 50,
      personIdOffset: 1_000_000,
      masterSeed: SEED,
      dateFrom: '2024-01-01',
      dateTo: '2024-12-31',
    });
    expect(a.persons).toEqual(b.persons);
    expect(a.drugExposures).toEqual(b.drugExposures);
    expect(a.measurements).toEqual(b.measurements);
  });

  it('olika seed → olika output', () => {
    const a = generateBulk({
      size: 50,
      personIdOffset: 1_000_000,
      masterSeed: SEED,
      dateFrom: '2024-01-01',
      dateTo: '2024-12-31',
    });
    const b = generateBulk({
      size: 50,
      personIdOffset: 1_000_000,
      masterSeed: 'something-else',
      dateFrom: '2024-01-01',
      dateTo: '2024-12-31',
    });
    expect(a.drugExposures.length).not.toBe(0);
    // Räcker att en av flera arrays skiljer
    expect(
      JSON.stringify(a.drugExposures) !== JSON.stringify(b.drugExposures) ||
        JSON.stringify(a.measurements) !== JSON.stringify(b.measurements),
    ).toBe(true);
  });

  it('person_id startar exakt på personIdOffset och är konsekutivt', () => {
    const a = generateBulk({
      size: 10,
      personIdOffset: 1_000_000,
      masterSeed: SEED,
      dateFrom: '2024-01-01',
      dateTo: '2024-12-31',
    });
    expect(a.persons.map((p) => p.person_id)).toEqual([
      1_000_000, 1_000_001, 1_000_002, 1_000_003, 1_000_004, 1_000_005, 1_000_006, 1_000_007,
      1_000_008, 1_000_009,
    ]);
  });

  it('drug + meas-rader pekar bara på person_ids inom genererat span', () => {
    const a = generateBulk({
      size: 25,
      personIdOffset: 1_000_000,
      masterSeed: SEED,
      dateFrom: '2024-01-01',
      dateTo: '2024-12-31',
    });
    const ids = new Set(a.persons.map((p) => p.person_id));
    for (const d of a.drugExposures) expect(ids.has(d.person_id)).toBe(true);
    for (const m of a.measurements) expect(ids.has(m.person_id)).toBe(true);
  });
});
