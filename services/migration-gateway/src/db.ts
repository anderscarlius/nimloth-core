import pg from "pg";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { GatewayConfig } from "./config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export type Pool = pg.Pool;

export function createPool(cfg: GatewayConfig["db"]): pg.Pool {
  return new pg.Pool({
    host: cfg.host,
    port: cfg.port,
    database: cfg.database,
    user: cfg.user,
    password: cfg.password,
    max: 10,
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function migrate(
  pool: pg.Pool,
  migrationsDir: string = path.join(__dirname, "..", "migrations"),
): Promise<void> {
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      for (const file of files) {
        const sql = readFileSync(path.join(migrationsDir, file), "utf-8");
        await pool.query(sql);
      }
      return;
    } catch (err) {
      lastErr = err;
      if (attempt < 5) await sleep(1000);
    }
  }
  throw lastErr;
}
