import { Router } from 'express';
import type { ComposerStats } from '../types.js';
import type { EhrCache } from '../ehr-cache.js';
import type { GapTracker } from '../gap-tracker.js';

export interface StatsDeps {
  stats: { events_received: number; compositions_written: number; events_gap: number; events_failed: number };
  cache: EhrCache;
  gaps: GapTracker;
  startedAt: string;
}

export function createStatsRouter(deps: StatsDeps): Router {
  const r = Router();
  r.get('/', async (_req, res) => {
    const ehrCount = await deps.cache.size().catch(() => 0);
    const composerStats: ComposerStats = {
      events_received: deps.stats.events_received,
      compositions_written: deps.stats.compositions_written,
      events_gap: deps.stats.events_gap,
      events_failed: deps.stats.events_failed,
      ehrs_created: ehrCount,
      started_at: deps.startedAt,
    };
    res.json({
      ...composerStats,
      gaps: deps.gaps.getGaps(),
      constraints_observed: deps.gaps.getConstraints(),
    });
  });
  return r;
}
