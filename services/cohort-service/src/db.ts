// pg-pool + migrate runner (mönster från omop-projector).

import pg from 'pg';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Logger } from 'pino';
import type { CohortConfig } from './config.js';

export type Pool = pg.Pool;

export function createPool(cfg: CohortConfig['db']): pg.Pool {
  return new pg.Pool({
    host: cfg.host,
    port: cfg.port,
    database: cfg.database,
    user: cfg.user,
    password: cfg.password,
    max: 10,
  });
}

export interface RetryOptions {
  retries: number;
  initialDelayMs: number;
  maxDelayMs: number;
}

// Default: ~5 försök inom ~15s — täcker det observerade fönstret där
// core-db:s TCP-port är öppen men Postgres ännu inte accepterar frågor
// (startup-racet från kraschloop-triagen 2026-08-18/19). TCP-waiten i
// compose är bälte; detta är hängslena.
export const DEFAULT_MIGRATE_RETRY: RetryOptions = {
  retries: 5,
  initialDelayMs: 500,
  maxDelayMs: 8000,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions,
  logger: Logger,
  label: string,
): Promise<T> {
  let attempt = 0;
  let delay = opts.initialDelayMs;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      attempt += 1;
      if (attempt > opts.retries) {
        logger.error({ err, attempt, label }, 'cohort-migration: gav upp efter upprepade försök');
        throw err;
      }
      logger.warn({ err, attempt, delayMs: delay, label }, 'cohort-migration: försök misslyckades, försöker igen');
      await sleep(delay);
      delay = Math.min(delay * 2, opts.maxDelayMs);
    }
  }
}

async function runMigrations(pool: pg.Pool, migrationsDir: string, logger: Logger): Promise<void> {
  const resolved = path.isAbsolute(migrationsDir)
    ? migrationsDir
    : path.resolve(process.cwd(), migrationsDir);
  const files = readdirSync(resolved)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const sql = readFileSync(path.join(resolved, file), 'utf-8');
    await pool.query(sql);
    logger.info({ file }, 'cohort-migration applied');
  }
}

// Migrationsfilerna är idempotenta (CREATE SCHEMA/TABLE IF NOT EXISTS),
// så hela migrate() kan säkert köras om vid transienta anslutningsfel —
// inte bara den första anslutningen.
export async function migrate(
  pool: pg.Pool,
  migrationsDir: string,
  logger: Logger,
  retryOptions: RetryOptions = DEFAULT_MIGRATE_RETRY,
): Promise<void> {
  await withRetry(() => runMigrations(pool, migrationsDir, logger), retryOptions, logger, 'migrate');
}
