// Bootstrap för composition-mapper. Scaffold-läge — bootar utan att kräva
// Kafka, EHRbase eller model-router. Mappning-, eval- och LLM-anrop
// levereras i 4.2-4.11 enligt P4-spec.

import { dirname } from 'node:path';
import { mkdirSync, existsSync } from 'node:fs';
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { CompositionMapperDb } from './db.js';
import { AuditPublisher } from './audit-publisher.js';
import { createApp } from './server.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);
  logger.info(
    { port: config.port, scaffold: true, dataMode: config.dataMode },
    'starting composition-mapper',
  );

  // B22.5 — synlig boot-warning vid demo-mode. Ska vara svår att missa
  // eftersom NIMLOTH_DATA_MODE=synthetic tillåter cloud-routing av LLM-anrop.
  if (config.dataMode === 'synthetic') {
    logger.warn(
      'NIMLOTH_DATA_MODE=synthetic. LLM-anrop får routas till cloud-providers. ' +
        'Detta läge är endast för demo med syntetisk data. ' +
        'ALDRIG för produktion med riktiga patientdata. ' +
        'Se docs/operations/Demo_Mode_Configuration.md.',
    );
  }

  // 1. Säkerställ datakatalog
  const dbDir = dirname(config.dbPath);
  if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });

  // 2. SQLite + migrations
  const db = new CompositionMapperDb(config.dbPath);
  db.migrate(config.migrationsPath, logger);

  // 3. Audit-publisher (lazy-connect — ingen Kafka-anslutning vid boot)
  const publisher = new AuditPublisher(
    {
      brokers: config.kafka.brokers,
      clientId: config.kafka.clientId,
      topic: config.kafka.auditTopic,
      drainIntervalMs: config.kafka.drainIntervalMs,
      batchSize: 50,
    },
    db,
    logger,
  );
  publisher.start();

  // 4. Express-server
  const app = createApp({
    publisher,
    logger,
    loadedAt: new Date().toISOString(),
  });

  const server = app.listen(config.port, () => {
    logger.info({ port: config.port }, 'composition-mapper ready');
  });

  // 5. Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'shutting down');
    server.close();
    await publisher.stop();
    db.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('composition-mapper bootstrap failed', err);
  process.exit(1);
});
