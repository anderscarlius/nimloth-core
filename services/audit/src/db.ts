import pg from 'pg';
import type { AuditConfig } from './config.js';

export function createPool(cfg: AuditConfig['db']): pg.Pool {
  return new pg.Pool({
    host: cfg.host,
    port: cfg.port,
    database: cfg.database,
    user: cfg.user,
    password: cfg.password,
    max: 5,
  });
}
