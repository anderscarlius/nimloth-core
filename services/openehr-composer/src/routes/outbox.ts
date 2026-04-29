// /composer/outbox/* — inspektion + manuell trigger för outbox.

import { Router, type Request, type Response } from 'express';
import type { Pool } from '../db.js';
import type { OutboxProcessor } from '../outbox/processor.js';

export interface OutboxRouterDeps {
  pool: Pool;
  processor: OutboxProcessor;
}

export function createOutboxRouter(deps: OutboxRouterDeps): Router {
  const r = Router();

  r.get('/', async (req: Request, res: Response) => {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const limit = Math.min(Number(req.query.limit ?? 50), 500);
    const params: unknown[] = [];
    let where = '';
    if (status) {
      params.push(status);
      where = `WHERE status = $${params.length}`;
    }
    params.push(limit);
    const r1 = await deps.pool.query(
      `SELECT id, event_id, event_type, patient_pnr, source,
              kafka_topic, kafka_partition, kafka_offset,
              status, attempts, last_error, composition_uid, ehr_id,
              created_at, processed_at
         FROM composer_outbox
         ${where}
         ORDER BY created_at DESC
         LIMIT $${params.length}`,
      params,
    );
    res.json({ count: r1.rows.length, rows: r1.rows });
  });

  r.get('/stats', async (_req: Request, res: Response) => {
    res.json(await deps.processor.stats());
  });

  /** Manuellt trigga en pollings-cykel — för demo + tester. */
  r.post('/poll', async (_req: Request, res: Response) => {
    res.json(await deps.processor.pollOnce());
  });

  return r;
}
