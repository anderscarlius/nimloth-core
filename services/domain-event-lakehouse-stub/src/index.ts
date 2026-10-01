import express from 'express';
import pino from 'pino';
import { loadConfig } from './config.js';
import { DomainEventLakehouseStubConsumer } from './consumer.js';

async function main(): Promise<void> {
  const cfg = loadConfig();
  const logger = pino({ level: cfg.logLevel });
  const consumer = new DomainEventLakehouseStubConsumer(cfg, logger);

  const app = express();
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'domain-event-lakehouse-stub' });
  });
  app.get('/stats', (_req, res) => {
    res.json({
      ...consumer.metrics,
      bronzePath: cfg.bronzePath,
      silverPath: cfg.silverPath,
      clinicalVitalsTopic: cfg.clinicalVitalsTopic,
    });
  });

  const server = app.listen(cfg.port, '0.0.0.0', () => {
    logger.info({ port: cfg.port }, 'domain-event-lakehouse-stub listening');
  });

  await consumer.start();

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'shutting down lakehouse-stub');
    server.close();
    await consumer.stop();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('domain-event-lakehouse-stub failed', err);
  process.exit(1);
});
