// openehr-composer bootstrap (Sprint 2 P3.1).

import express from 'express';
import path from 'node:path';
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { createPool, migrate } from './db.js';
import { EhrbaseClient } from './ehrbase-client.js';
import { EhrCache } from './ehr-cache.js';
import { GapTracker } from './gap-tracker.js';
import { createHealthRouter } from './routes/health.js';
import { createEventRouter } from './routes/event.js';
import { createTemplatesRouter } from './routes/templates.js';
import { createEhrRouter } from './routes/ehr.js';
import { createStatsRouter } from './routes/stats.js';

async function main(): Promise<void> {
  const cfg = loadConfig();
  const logger = createLogger(cfg.logLevel);
  logger.info({ port: cfg.port, ehrbase: cfg.ehrbase.baseUrl }, 'starting openehr-composer');

  const pool = createPool(cfg.db);
  const migrationsDir = path.resolve(process.cwd(), 'migrations');
  await migrate(pool, migrationsDir, logger);

  const ehrbase = new EhrbaseClient(cfg.ehrbase.baseUrl, logger);
  const cache = new EhrCache(pool, ehrbase, logger);
  const gaps = new GapTracker();
  const stats = { events_received: 0, compositions_written: 0, events_gap: 0, events_failed: 0 };
  const startedAt = new Date().toISOString();

  // Sanity-check vid startup: vilka templates finns redan i EHRbase?
  try {
    const loaded = await ehrbase.listTemplates();
    const present = new Set(loaded.map((t) => t.template_id));
    const missing = cfg.expectedTemplateIds.filter((id) => !present.has(id));
    if (missing.length > 0) {
      logger.warn({ missing, present: [...present] }, 'expected templates missing in EHRbase — composer kan inte skriva mot dessa förrän de laddas (pnpm openehr:load-templates)');
    } else {
      logger.info({ templates: cfg.expectedTemplateIds }, 'all expected templates present');
    }
  } catch (err) {
    logger.warn({ err: String(err) }, 'EHRbase listTemplates failed at startup — fortsätter ändå');
  }

  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/composer/health', createHealthRouter());
  app.use('/composer/event', createEventRouter({ cache, ehrbase, gaps, logger, stats }));
  app.use('/composer/templates', createTemplatesRouter(ehrbase));
  app.use('/composer/ehr', createEhrRouter(cache));
  app.use('/composer/stats', createStatsRouter({ stats, cache, gaps, startedAt }));

  const server = app.listen(cfg.port, '0.0.0.0', () => {
    logger.info({ port: cfg.port }, 'openehr-composer listening');
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'shutting down');
    server.close();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('openehr-composer bootstrap failed', err);
  process.exit(1);
});
