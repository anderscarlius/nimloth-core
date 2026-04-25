// FHIR Facade — bootstrap.

import { Kafka } from 'kafkajs';
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { createPool } from './db.js';
import { Materializer } from './materializer.js';
import { createServer } from './server.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);

  logger.info(
    {
      instance_id: config.instanceId,
      fhir_mode: config.mode,
      db: config.db.host,
      kafka: config.kafka.brokers,
    },
    'Starting FHIR Facade',
  );

  if (config.mode === 'replica') {
    logger.info(
      'FHIR_MODE=replica på central fhir-facade är no-op — replica-läget implementeras av @nimloth-core/edge (services/edge) som kör en dedikerad SQLite-baserad FHIR-server. Denna container fortsätter i primary-läge.',
    );
  }

  const pool = createPool(config.db);
  // Varma upp pool och verifiera DB.
  try {
    await pool.query('SELECT 1');
    logger.info('DB connected');
  } catch (err) {
    logger.error({ err }, 'Cannot connect to core-db');
    process.exit(1);
  }

  // Kafka producer för audit-events
  const kafka = new Kafka({
    clientId: `${config.kafka.clientId}-audit`,
    brokers: config.kafka.brokers,
    retry: { retries: 10, initialRetryTime: 300 },
  });
  const auditProducer = kafka.producer({ idempotent: true });
  await auditProducer.connect();

  const materializer = new Materializer(config, pool, logger);

  const app = createServer({
    pool,
    auditProducer,
    logger,
    instanceId: config.instanceId,
    mode: config.mode,
    getMaterializerMetrics: () => ({
      processed: materializer.processed,
      errors: materializer.errors,
      byType: { ...materializer.byType },
    }),
  });

  const server = app.listen(config.port, () => {
    logger.info({ port: config.port }, 'HTTP server ready');
  });

  // Starta materializer (primary-mode)
  if (config.mode === 'primary') {
    try {
      await materializer.start();
    } catch (err) {
      logger.error({ err }, 'Failed to start materializer');
      process.exit(1);
    }
  }

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutting down');
    server.close();
    try {
      await materializer.stop();
    } catch {
      /* ignore */
    }
    try {
      await auditProducer.disconnect();
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
