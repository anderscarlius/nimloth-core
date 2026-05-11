// Express-server för composition-mapper. Tidigare scaffold (bara /health);
// B25 4.10.5 lade till POST /api/v1/map/medication-statement för demo-instans.

import express, { type Express } from 'express';
import type { Logger } from 'pino';
import type { ModelRouter } from '@nimloth-core/model-router';
import type { AuditPublisher } from './audit-publisher.js';
import type { CompositionMapperConfig } from './config.js';
import type { CompositionMapperDb } from './db.js';
import { createMapRouter } from './routes/map.js';

export interface ServerDeps {
  publisher: AuditPublisher;
  logger: Logger;
  loadedAt: string;
  /** Required för POST /api/v1/map (B25 4.10.5). */
  router: ModelRouter;
  /** Required för POST /api/v1/map (B25 4.10.5). */
  config: CompositionMapperConfig;
  /** Optional — om satt skrivs audit-events till outbox per map-request. */
  db?: CompositionMapperDb;
}

const VERSION = '0.1.0';

export function createApp(deps: ServerDeps): Express {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      service: 'composition-mapper',
      version: VERSION,
      loadedAt: deps.loadedAt,
      dataMode: deps.config.dataMode,
      audit: deps.publisher.status(),
    });
  });

  // B25 4.10.5 — map-route. Demo-instans behöver HTTP-yta för faktisk
  // mapping. Internt instansieras LlmAssist en gång och återanvänds.
  app.use(
    '/api/v1/map',
    createMapRouter({
      router: deps.router,
      config: deps.config,
      logger: deps.logger,
      ...(deps.db ? { db: deps.db } : {}),
    }),
  );

  return app;
}
