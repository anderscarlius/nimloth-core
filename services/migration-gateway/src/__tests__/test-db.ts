import pg from "pg";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, "..", "..", "migrations");

export function testPoolConfig() {
  return {
    host: process.env.PGHOST ?? "localhost",
    port: Number(process.env.PGPORT ?? 5435),
    database: process.env.PGDATABASE ?? "core",
    user: process.env.PGUSER ?? "core",
    password: process.env.PGPASSWORD ?? "core",
  };
}

export async function freshTestPool(): Promise<pg.Pool> {
  const pool = new pg.Pool(testPoolConfig());
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    await pool.query(readFileSync(path.join(MIGRATIONS_DIR, file), "utf-8"));
  }
  await pool.query(
    "TRUNCATE legacy_patient_identity, routing_history, shadow_write_log, reverse_shadow_write_log, note_provenance",
  );
  return pool;
}
