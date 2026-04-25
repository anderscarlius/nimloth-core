// PostgreSQL-anslutningar för seeding.
// Defaults matchar körning från host (localhost:5433/5434). Override via env.

import pg from 'pg';

export function meliorPool(): pg.Pool {
  return new pg.Pool({
    host: process.env.MELIOR_DB_HOST ?? 'localhost',
    port: Number(process.env.MELIOR_DB_PORT ?? 5433),
    database: process.env.MELIOR_DB_NAME ?? 'melior',
    user: process.env.MELIOR_DB_USER ?? 'melior',
    password: process.env.MELIOR_DB_PASSWORD ?? 'melior',
  });
}

export function asynjaPool(): pg.Pool {
  return new pg.Pool({
    host: process.env.ASYNJA_DB_HOST ?? 'localhost',
    port: Number(process.env.ASYNJA_DB_PORT ?? 5434),
    database: process.env.ASYNJA_DB_NAME ?? 'asynja',
    user: process.env.ASYNJA_DB_USER ?? 'asynja',
    password: process.env.ASYNJA_DB_PASSWORD ?? 'asynja',
  });
}
