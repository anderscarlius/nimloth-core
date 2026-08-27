#!/usr/bin/env tsx
// B4 Etapp 1, Fas B steg 6 — kör paritetsdiffen mot det verkliga
// skillnadsfallet och skriv en läsbar rapport.
//
// Körs:
//   LEGACY_SIM_BASE_URL=http://localhost:11601 \
//   EHRBASE_BASE_URL=http://localhost:11401/ehrbase \
//   GATEWAY_PGPORT=10435 \
//   tsx src/parity/scripts/run-anteckning-diff.ts <patient_no> <ehr_id>

import pg from "pg";
import { diffAnteckningForPatient } from "../anteckning-diff.js";

async function main(): Promise<void> {
  const [patientNo, ehrId] = process.argv.slice(2);
  if (!patientNo || !ehrId) {
    console.error("Användning: run-anteckning-diff.ts <patient_no> <ehr_id>");
    process.exit(1);
  }

  const gatewayPool = new pg.Pool({
    host: process.env.GATEWAY_PGHOST ?? "localhost",
    port: Number(process.env.GATEWAY_PGPORT ?? 10435),
    database: process.env.GATEWAY_PGDATABASE ?? "core",
    user: process.env.GATEWAY_PGUSER ?? "core",
    password: process.env.GATEWAY_PGPASSWORD ?? "core",
  });

  const result = await diffAnteckningForPatient(
    {
      legacySimBaseUrl: process.env.LEGACY_SIM_BASE_URL ?? "http://localhost:11601",
      ehrbaseBaseUrl: process.env.EHRBASE_BASE_URL ?? "http://localhost:11401/ehrbase",
      gatewayPool,
    },
    patientNo,
    ehrId,
  );

  console.log(`\n=== Paritetsdiff — anteckning — patient_no=${result.patientNo} ehr_id=${result.ehrId} ===\n`);
  console.log(`Totalt antal legacy-anteckningar: ${result.totalLegacyNotes}\n`);
  console.log("Klassificering:");
  for (const [key, count] of Object.entries(result.summary)) {
    console.log(`  ${key}: ${count}`);
  }
  console.log("\nDetalj:");
  for (const row of result.rows) {
    console.log(`  [${row.classification}] ${row.legacyNoteId}`);
    console.log(`    legacy:  ${row.legacyText}`);
    if (row.openEhrText !== null) console.log(`    openehr: ${row.openEhrText}`);
    if (row.errorDetail) console.log(`    fel:     ${row.errorDetail}`);
  }

  await gatewayPool.end();
}

main().catch((err) => {
  console.error("fatalt fel:", err);
  process.exit(1);
});
