// Postgres-anslutning + migration-runner.

import pg from 'pg';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Logger } from 'pino';
import type { ComposerConfig } from './config.js';

export type Pool = pg.Pool;

export function createPool(cfg: ComposerConfig['db']): pg.Pool {
  return new pg.Pool({
    host: cfg.host,
    port: cfg.port,
    database: cfg.database,
    user: cfg.user,
    password: cfg.password,
    max: 10,
  });
}

/** Kör SQL-filerna i ordning. Idempotent — vi använder IF NOT EXISTS. */
export async function migrate(pool: pg.Pool, migrationsDir: string, logger: Logger): Promise<void> {
  const resolved = path.isAbsolute(migrationsDir)
    ? migrationsDir
    : path.resolve(process.cwd(), migrationsDir);
  const files = readdirSync(resolved)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const sql = readFileSync(path.join(resolved, file), 'utf-8');
    await pool.query(sql);
    logger.info({ file }, 'migration applied');
  }
}
