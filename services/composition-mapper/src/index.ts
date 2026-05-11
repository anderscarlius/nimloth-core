// Bootstrap för composition-mapper.
// B25 4.10.5: HTTP API-yta för demo-instans — ModelRouter laddas vid boot
// så att POST /api/v1/map/medication-statement kan invokera LLM-pipelinen.
// Audit-publisher disabled-mode aktiveras om KAFKA_BROKERS=disabled (eller tomt).

import { dirname, join } from 'node:path';
import { mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ModelRouter, loadRouterConfig } from '@nimloth-core/model-router';
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { CompositionMapperDb } from './db.js';
import { AuditPublisher } from './audit-publisher.js';
import { createApp } from './server.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Default model-routing-config-path. I produktions-build kopieras config/-
 * mappen till /app/config via Dockerfile (B25 4.10.5). I dev kör vi via tsx
 * från src/ — då ligger config två steg upp.
 */
function resolveRouterConfigPath(): string {
  const fromEnv = process.env.MODEL_ROUTING_CONFIG;
  if (fromEnv) return fromEnv;
  // Produktion: /app/config/model-routing.yaml (Dockerfile-layout)
  const prodPath = '/app/config/model-routing.yaml';
  if (existsSync(prodPath)) return prodPath;
  // Dev / monorepo-root
  return join(__dirname, '..', '..', '..', 'config', 'model-routing.yaml');
}

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);
  logger.info(
    { port: config.port, dataMode: config.dataMode },
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

  // 3. Audit-publisher (lazy-connect, eller disabled-mode om KAFKA_BROKERS=disabled)
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

  // 4. ModelRouter (B25 4.10.5) — laddas vid boot eftersom map-endpointen
  // delar router-instans med övriga konsumenter. loadRouterConfig validerar
  // YAML — krasch vid boot om configen är trasig (önskat fail-fast).
  const routerConfigPath = resolveRouterConfigPath();
  logger.info({ routerConfigPath }, 'loading model-router config');
  const routerConfig = loadRouterConfig(routerConfigPath);
  const router = new ModelRouter(routerConfig);
  logger.info(
    {
      providers: router.listProviders().map((p) => p.id),
      rules: router.listRules().length,
    },
    'model-router ready',
  );

  // 5. Express-server
  const app = createApp({
    publisher,
    logger,
    loadedAt: new Date().toISOString(),
    router,
    config,
    db,
  });

  const server = app.listen(config.port, () => {
    logger.info({ port: config.port }, 'composition-mapper ready');
  });

  // 6. Graceful shutdown
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
