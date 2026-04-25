import pg from 'pg';
import type { FhirFacadeConfig } from './config.js';

export function createPool(cfg: FhirFacadeConfig['db']): pg.Pool {
  return new pg.Pool({
    host: cfg.host,
    port: cfg.port,
    database: cfg.database,
    user: cfg.user,
    password: cfg.password,
    max: 10,
    idleTimeoutMillis: 30000,
  });
}

/** Hjälpare: normalisera personnummer till formatet yymmdd-xxxx (som seed använder). */
export function normalizePnr(input: string): string {
  return input.trim();
}
