#!/usr/bin/env tsx
// B4 Etapp 3 — genererar exportpaketet för en ehr_id. Körs som en del av
// execute-revert.ts (in-process import, se den filen), men går också att
// köra fristående för inspektion:
//
//   GATEWAY_PGPORT=10435 tsx src/scripts/generate-export-package.ts \
//     548a149c-fd3d-4e30-aaf2-176a5ed5f546 ./export-output

import pg from "pg";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createLegacyClient } from "../legacy-client.js";
import { createOpenEhrClient } from "../openehr-client.js";
import { generateExportPackage } from "../export-package.js";

const DOMAIN_NOTE = "anteckning";
const LOSS_LEDGER_PATH =
  process.env.LOSS_LEDGER_PATH ??
  path.resolve(process.cwd(), "../../../nimloth-docs/Forlustliggare_Anteckning_2026-08-19.md");

async function main(): Promise<void> {
  const [ehrId, outDir] = process.argv.slice(2);
  if (!ehrId || !outDir) {
    console.error("Användning: generate-export-package.ts <ehr_id> <out_dir>");
    process.exit(1);
  }

  const pool = new pg.Pool({
    host: process.env.GATEWAY_PGHOST ?? "localhost",
    port: Number(process.env.GATEWAY_PGPORT ?? 10435),
    database: process.env.GATEWAY_PGDATABASE ?? "core",
    user: process.env.GATEWAY_PGUSER ?? "core",
    password: process.env.GATEWAY_PGPASSWORD ?? "core",
  });
  const legacyClient = createLegacyClient(process.env.LEGACY_SIM_BASE_URL ?? "http://localhost:11601");
  const openEhrClient = createOpenEhrClient(process.env.EHRBASE_BASE_URL ?? "http://localhost:11401/ehrbase");
  const lossLedgerContent = await readFile(LOSS_LEDGER_PATH, "utf8");

  const manifest = await generateExportPackage(
    {
      pool,
      legacyClient,
      openEhrClient,
      domain: DOMAIN_NOTE,
      lossLedgerPath: LOSS_LEDGER_PATH,
      lossLedgerContent,
      nowIso: new Date().toISOString(),
    },
    ehrId,
    outDir,
  );

  console.log(`Exportpaket genererat: ${manifest.itemCount} poster, ${outDir}/manifest.json`);
  await pool.end();
}

main().catch((err) => {
  console.error("fatalt fel:", err);
  process.exit(1);
});
