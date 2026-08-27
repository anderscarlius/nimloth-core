#!/usr/bin/env tsx
// B4 Etapp 2 — skuggskuldsrapport (Grind 1 punkt f). Svarar på: hur långt
// efter ligger legacy just nu, och vad skulle det kosta att komma ikapp?
//
// Körs:
//   GATEWAY_PGPORT=10435 tsx src/scripts/report-shadow-debt.ts

import pg from "pg";
import { getShadowDebt } from "../shadow-debt.js";

async function main(): Promise<void> {
  const pool = new pg.Pool({
    host: process.env.GATEWAY_PGHOST ?? "localhost",
    port: Number(process.env.GATEWAY_PGPORT ?? 10435),
    database: process.env.GATEWAY_PGDATABASE ?? "core",
    user: process.env.GATEWAY_PGUSER ?? "core",
    password: process.env.GATEWAY_PGPASSWORD ?? "core",
  });

  const debt = await getShadowDebt(pool);
  console.log("\n=== Skuggskuld — omvänd skrivning (Nimloth → legacy) ===\n");
  console.log(`FAILED-poster:              ${debt.failedCount}`);
  console.log(`Äldsta FAILED sedan:        ${debt.oldestFailedAt ?? "—"}`);
  console.log(`Hur långt efter (sekunder): ${debt.lagSeconds ?? "—"}`);
  console.log(`Snittlatens SUCCESS (ms):   ${debt.avgSuccessDurationMs?.toFixed(1) ?? "—"}`);
  console.log(`Uppskattad ikapp-kostnad:   ${debt.estimatedCatchUpMs ?? "—"} ms`);

  await pool.end();
}

main().catch((err) => {
  console.error("fatalt fel:", err);
  process.exit(1);
});
