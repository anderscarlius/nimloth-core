// Audit-tjänst — bootstrap.

import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { createPool } from './db.js';
import { AuditStore } from './store.js';
import { AuditConsumer } from './consumer.js';
import { createServer } from './server.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);
  logger.info({ port: config.port, topic: config.topic }, 'Starting audit service');

  const pool = createPool(config.db);
  try {
    await pool.query('SELECT 1');
    logger.info('DB connected');
  } catch (err) {
    logger.error({ err }, 'Cannot connect to core-db');
    process.exit(1);
  }

  const store = new AuditStore(pool, config.batch, logger);
  const consumer = new AuditConsumer(config, store, logger);

  const app = createServer({
    pool,
    store,
    consumer,
    logger,
    enforceAdmin: config.enforceAdmin,
  });

  const server = app.listen(config.port, () => {
    logger.info({ port: config.port }, 'HTTP server ready');
  });

  try {
    await consumer.start();
  } catch (err) {
    logger.error({ err }, 'Failed to start audit consumer');
    process.exit(1);
  }

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutting down');
    server.close();
    try {
      await consumer.stop();
    } catch {
      /* ignore */
    }
    try {
      await store.flush('shutdown');
    } catch {
      /* ignore */
    }
    await pool.end();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
