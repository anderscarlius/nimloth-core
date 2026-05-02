// FHIR Facade — bootstrap.

import path from 'node:path';
import { Kafka } from 'kafkajs';
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { createPool, migrate } from './db.js';
import { Materializer } from './materializer.js';
import { createServer } from './server.js';
import { createStoreRouter } from './stores/index.js';
import { ParityRunner } from './parity/runner.js';
import { startParityScheduler, type ParitySchedulerHandle } from './parity/scheduler.js';

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

  // Kör migrationer (Sprint 2 P3.4 — fhir-facade-ägda tabeller).
  // Idempotent via IF NOT EXISTS i varje migration-fil.
  try {
    await migrate(pool, path.resolve(process.cwd(), 'migrations'), logger);
  } catch (err) {
    logger.error({ err }, 'Migration failed');
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

  const storeRouter = createStoreRouter({
    pool,
    ehrbaseUrl: config.ehrbaseUrl,
    mode: config.canonicalStore,
    logger,
  });
  logger.info(
    { canonical_store: config.canonicalStore, ehrbase_url: config.ehrbaseUrl },
    'Store router initialized',
  );

  // Sprint 2 P3.4: ParityRunner skapas bara i 'both'-mode. I andra modes
  // är paritetsmätning meningslös (asymmetrisk) — endpoints returnerar 503.
  let parityRunner: ParityRunner | null = null;
  let parityScheduler: ParitySchedulerHandle | null = null;
  if (config.canonicalStore === 'both') {
    parityRunner = new ParityRunner({ storeRouter, pool, auditProducer, logger });
    logger.info('Parity runner initialized (CANONICAL_STORE=both)');
    parityScheduler = startParityScheduler(parityRunner, logger);
  } else {
    logger.info(
      { mode: config.canonicalStore },
      'Parity runner not initialized — CANONICAL_STORE != both',
    );
  }

  const app = createServer({
    pool,
    auditProducer,
    logger,
    instanceId: config.instanceId,
    mode: config.mode,
    storeRouter,
    parityRunner,
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
    if (parityScheduler) parityScheduler.stop();
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
