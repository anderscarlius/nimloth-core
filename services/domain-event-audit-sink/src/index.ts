import express from 'express';
import pino from 'pino';
import { loadConfig } from './config.js';
import { DomainEventAuditSinkConsumer } from './consumer.js';

async function main(): Promise<void> {
  const cfg = loadConfig();
  const logger = pino({ level: cfg.logLevel });
  const consumer = new DomainEventAuditSinkConsumer(cfg, logger);

  const app = express();
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'domain-event-audit-sink' });
  });
  app.get('/stats', (_req, res) => {
    res.json(consumer.metrics);
  });

  const server = app.listen(cfg.port, '0.0.0.0', () => {
    logger.info({ port: cfg.port }, 'domain-event-audit-sink listening');
  });

  await consumer.start();

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'shutting down audit-sink');
    server.close();
    await consumer.stop();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('domain-event-audit-sink failed', err);
  process.exit(1);
});
