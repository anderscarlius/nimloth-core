// HTTP-routes för cohort-service.
//
//   GET  /api/cohorts                          → lista definitioner
//   POST /api/cohorts                          → skapa ad-hoc definition från {name, definition_sql}
//   POST /api/cohorts/:idOrName/instantiate    → kör SQL → fyll cohort
//   GET  /api/cohorts/:idOrName/sample?n=10&seed=42  → deterministisk sampling

import express, { type Router, type Request, type Response } from 'express';
import type pg from 'pg';
import { z } from 'zod';
import type { Logger } from 'pino';
import { findDefinition, instantiate, listDefinitions, sample } from '../cohort.js';

const AdHocSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().optional(),
  definition_sql: z.string().min(1),
});

const SampleQuerySchema = z.object({
  n: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : 10))
    .refine((v) => Number.isInteger(v) && v > 0 && v <= 1000, 'n måste vara 1..1000'),
  seed: z.string().optional().default('default-seed'),
});

export function buildCohortRouter(pool: pg.Pool, logger: Logger): Router {
  const r = express.Router();

  // GET /api/cohorts ----------------------------------------------------
  r.get('/', async (_req: Request, res: Response) => {
    const defs = await listDefinitions(pool);
    res.json({
      total: defs.length,
      definitions: defs.map((d) => ({
        cohort_definition_id: d.cohort_definition_id,
        name: d.name,
        description: d.description,
        is_predefined: d.is_predefined,
      })),
    });
  });

  // POST /api/cohorts (ad-hoc) ------------------------------------------
  r.post('/', async (req: Request, res: Response) => {
    const parsed = AdHocSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input', issues: parsed.error.issues });
      return;
    }
    try {
      const out = await pool.query<{ cohort_definition_id: number }>(
        `INSERT INTO cohort.cohort_definition (name, description, definition_sql, is_predefined)
         VALUES ($1, $2, $3, FALSE)
         ON CONFLICT (name) DO UPDATE SET definition_sql = EXCLUDED.definition_sql
         RETURNING cohort_definition_id`,
        [parsed.data.name, parsed.data.description ?? null, parsed.data.definition_sql],
      );
      res.status(201).json({ cohort_definition_id: out.rows[0].cohort_definition_id, name: parsed.data.name });
    } catch (e) {
      logger.error({ err: e }, 'failed to create cohort definition');
      res.status(500).json({ error: 'db_error', message: (e as Error).message });
    }
  });

  // POST /api/cohorts/:id/instantiate ------------------------------------
  r.post('/:id/instantiate', async (req: Request, res: Response) => {
    const id = decodeIdOrName(req.params.id);
    const def = await findDefinition(pool, id);
    if (!def) {
      res.status(404).json({ error: 'not_found', identifier: id });
      return;
    }
    try {
      const result = await instantiate(pool, def);
      res.json(result);
    } catch (e) {
      logger.error({ err: e, name: def.name }, 'instantiate failed');
      res.status(500).json({ error: 'instantiate_failed', message: (e as Error).message });
    }
  });

  // GET /api/cohorts/:id/sample?n=10&seed=42 -----------------------------
  r.get('/:id/sample', async (req: Request, res: Response) => {
    const id = decodeIdOrName(req.params.id);
    const def = await findDefinition(pool, id);
    if (!def) {
      res.status(404).json({ error: 'not_found', identifier: id });
      return;
    }
    const parsed = SampleQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_query', issues: parsed.error.issues });
      return;
    }
    const result = await sample(pool, def, parsed.data.n, parsed.data.seed);
    res.json(result);
  });

  return r;
}

function decodeIdOrName(s: string): string | number {
  if (/^\d+$/.test(s)) return Number(s);
  return s;
}
