// Scheduler-tester (Sprint 2 P3.4, steg 4.8).
//
// Mock-clock-tester. Verifierar att nextScheduledRun beräknar nästa
// söndag 02:00 UTC och att första körning aldrig sker före
// MIN_FIRST_RUN_AT (2026-05-10T02:00:00Z).

import { describe, expect, it } from 'vitest';
import { nextScheduledRun } from '../parity/scheduler.js';

describe('nextScheduledRun', () => {
  it('hoppar till MIN_FIRST_RUN_AT när nu är dag-0 (2026-04-30)', () => {
    const dag0 = new Date('2026-04-30T22:03:00Z'); // Torsdag
    const next = nextScheduledRun(dag0);
    // Första naiva söndag 02:00 efter torsdag 2026-04-30 = söndag 2026-05-03 02:00.
    // Men 2026-05-03 < 2026-05-10 ⇒ MIN_FIRST_RUN_AT vinner.
    expect(next.toISOString()).toBe('2026-05-10T02:00:00.000Z');
  });

  it('returnerar nästa söndag 02:00 UTC när det är efter MIN_FIRST_RUN_AT', () => {
    const after = new Date('2026-05-12T08:00:00Z'); // Tisdag efter första kör
    const next = nextScheduledRun(after);
    // Nästa söndag = 2026-05-17 02:00 UTC
    expect(next.toISOString()).toBe('2026-05-17T02:00:00.000Z');
  });

  it('hoppar till påföljande söndag om "nu" är söndag 03:00', () => {
    const sundayAfterTrigger = new Date('2026-05-17T03:00:00Z');
    const next = nextScheduledRun(sundayAfterTrigger);
    expect(next.toISOString()).toBe('2026-05-24T02:00:00.000Z');
  });

  it('returnerar samma söndag om "nu" är söndag 01:00 (innan trigger-tid)', () => {
    const sundayBeforeTrigger = new Date('2026-05-17T01:30:00Z');
    const next = nextScheduledRun(sundayBeforeTrigger);
    expect(next.toISOString()).toBe('2026-05-17T02:00:00.000Z');
  });

  it('första körning >= 2026-05-10 02:00 UTC oavsett startdatum', () => {
    // Spec AC9: ≥7 dagar efter dag-0 (2026-04-30)
    for (const candidate of [
      new Date('2026-04-30T00:00:00Z'),
      new Date('2026-05-01T00:00:00Z'),
      new Date('2026-05-03T01:59:59Z'),
      new Date('2026-05-09T23:59:59Z'),
    ]) {
      const next = nextScheduledRun(candidate);
      expect(next.getTime()).toBeGreaterThanOrEqual(new Date('2026-05-10T02:00:00Z').getTime());
    }
  });
});
