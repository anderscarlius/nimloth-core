// Express-server för composition-mapper. Scaffold-läge — bara /health.
// Mappning-endpoints (POST /map/medication-statement) levereras i 4.5+.

import express, { type Express } from 'express';
import type { Logger } from 'pino';
import type { AuditPublisher } from './audit-publisher.js';

export interface ServerDeps {
  publisher: AuditPublisher;
  logger: Logger;
  loadedAt: string;
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
      audit: deps.publisher.status(),
    });
  });

  return app;
}
