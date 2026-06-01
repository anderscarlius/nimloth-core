// Entry point — startar HTTP-server.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { createPool, migrate } from './db.js';
import { createLogger } from './logger.js';
import { buildApp } from './server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main(): Promise<void> {
  const logger = createLogger(process.env.LOG_LEVEL ?? 'info');
  const cfg = loadConfig();
  const pool = createPool(cfg.db);

  const migrationsDir = path.resolve(__dirname, '..', 'migrations');
  await migrate(pool, migrationsDir, logger);

  const app = buildApp({ pool, logger });
  const server = app.listen(cfg.http.port, cfg.http.host, () => {
    logger.info({ host: cfg.http.host, port: cfg.http.port }, 'cohort-service lyssnar');
  });

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'shutdown begins');
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  process.stderr.write(`FATAL: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(1);
});
