// Express-app builder — separat från index.ts så vi kan testa via supertest.

import cors from 'cors';
import express, { type Express } from 'express';
import type pg from 'pg';
import type { Logger } from 'pino';
import type { EhrbaseClient } from './ehrbase-client.js';
import { buildCohortRouter } from './routes/cohorts.js';
import { buildLineageRouter } from './routes/lineage.js';
import { buildPatientRouter } from './routes/patients.js';

export interface ServerDeps {
  pool: pg.Pool;
  ehr: EhrbaseClient;
  logger: Logger;
}

export function buildApp(deps: ServerDeps): Express {
  const app = express();

  // CORS: Atlas-origin (nimloth-atlas.carlius.net) + lokal dev. Komma-separerad
  // env-lista; om tom = wildcard (acceptabelt eftersom datan är synthetic och
  // ingen MFA-skydd ligger på själva API:t — Cloudflare Access skyddar tunneln).
  const corsAllowed = (process.env.CORS_ALLOWED_ORIGINS ?? '*')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  app.use(
    cors({
      origin: corsAllowed.length === 1 && corsAllowed[0] === '*' ? true : corsAllowed,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '256kb' }));

  app.get('/healthz', async (_req, res) => {
    try {
      await deps.pool.query('SELECT 1');
      res.json({ status: 'ok', service: 'cohort-service' });
    } catch (e) {
      res.status(503).json({ status: 'unhealthy', message: (e as Error).message });
    }
  });

  app.use('/api/cohorts', buildCohortRouter(deps.pool, deps.logger));
  app.use('/api/patients', buildPatientRouter(deps.pool, deps.ehr, deps.logger));
  app.use('/api/lineage', buildLineageRouter(deps.ehr, deps.logger));

  // Stoppa läckage av stack-traces
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    deps.logger.error({ err: err.message, stack: err.stack }, 'unhandled');
    res.status(500).json({ error: 'internal', message: err.message });
  });

  return app;
}
