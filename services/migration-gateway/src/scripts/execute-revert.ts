#!/usr/bin/env tsx
// B4 Etapp 3 (B4a) — S2→S3-återgången, mätt som EN procedur (insikt 5 i
// prompten): förkontroll (skuggskuld + paritetsdiff åt båda håll) →
// beslut → växling → bekräftelse → exportpaketets generering.
//
// Grind 1-uppföljning, punkt 2: rapporterar TVÅ tal, tydligt märkta —
// total väggklocka (mät EXTERNT med `time`, se körinstruktion) och
// "logik utan verktygsoverhead" (denna procedurs uppmätta arbete minus
// tsx-kallstarter). Paritetsdiffen körs som en spawnad underprocess i
// fhir-facade (annat paket, egen tsx-uppstart) — exportgenereringen körs
// DÄREMOT in-process (samma paket som denna fil), så den bidrar inte med
// en andra kallstart.
//
// Körs (mät total väggklocka utifrån):
//   time GATEWAY_URL=http://localhost:11113 GATEWAY_PGPORT=10435 \
//     tsx src/scripts/execute-revert.ts anteckning vc-lund-norr 1001 \
//     548a149c-fd3d-4e30-aaf2-176a5ed5f546 ./export-output operator-demo

import pg from "pg";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { getShadowDebt } from "../shadow-debt.js";
import { generateExportPackage } from "../export-package.js";
import { createLegacyClient } from "../legacy-client.js";
import { createOpenEhrClient } from "../openehr-client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FHIR_FACADE_DIR = path.resolve(__dirname, "../../../fhir-facade");
// Uppmätt separat (se rapporten): en tom tsx-process tar ~500 ms att
// starta lokalt. Ett känt, redovisat antagande — inte en gissning gjord
// här.
const TSX_COLDSTART_BASELINE_MS = 500;

const GATEWAY_URL = process.env.GATEWAY_URL ?? "http://localhost:11113";
const [domain, careUnit, patientNo, ehrId, outDir, updatedBy] = process.argv.slice(2);

if (!domain || !careUnit || !patientNo || !ehrId || !outDir || !updatedBy) {
  console.error("Användning: execute-revert.ts <domain> <care_unit> <patient_no> <ehr_id> <out_dir> <updated_by>");
  process.exit(1);
}

function step(label: string): number {
  const t = Date.now();
  console.log(`[${new Date(t).toISOString()}] ${label}`);
  return t;
}

function runDiffScript(): Promise<{ durationMs: number; output: string }> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const child = spawn(
      "pnpm",
      ["exec", "tsx", "src/parity/scripts/run-anteckning-diff.ts", patientNo, ehrId],
      {
        cwd: FHIR_FACADE_DIR,
        env: {
          ...process.env,
          PGHOST: process.env.GATEWAY_PGHOST ?? "localhost",
          PGPORT: process.env.GATEWAY_PGPORT ?? "10435",
          PGDATABASE: process.env.GATEWAY_PGDATABASE ?? "core",
          PGUSER: process.env.GATEWAY_PGUSER ?? "core",
          PGPASSWORD: process.env.GATEWAY_PGPASSWORD ?? "core",
          LEGACY_SIM_BASE_URL: process.env.LEGACY_SIM_BASE_URL ?? "http://localhost:11601",
          EHRBASE_BASE_URL: process.env.EHRBASE_BASE_URL ?? "http://localhost:11401/ehrbase",
        },
      },
    );
    let output = "";
    child.stdout.on("data", (d) => (output += d.toString()));
    child.stderr.on("data", (d) => (output += d.toString()));
    child.on("close", (code) => {
      const durationMs = Date.now() - start;
      if (code !== 0) {
        reject(new Error(`paritetsdiff-processen avslutades med kod ${code}:\n${output}`));
        return;
      }
      resolve({ durationMs, output });
    });
  });
}

async function main(): Promise<void> {
  const pool = new pg.Pool({
    host: process.env.GATEWAY_PGHOST ?? "localhost",
    port: Number(process.env.GATEWAY_PGPORT ?? 10435),
    database: process.env.GATEWAY_PGDATABASE ?? "core",
    user: process.env.GATEWAY_PGUSER ?? "core",
    password: process.env.GATEWAY_PGPASSWORD ?? "core",
  });
  const legacyClient = createLegacyClient(process.env.LEGACY_SIM_BASE_URL ?? "http://localhost:11601");
  const openEhrClient = createOpenEhrClient(process.env.EHRBASE_BASE_URL ?? "http://localhost:11401/ehrbase");
  const lossLedgerPath =
    process.env.LOSS_LEDGER_PATH ?? path.resolve(__dirname, "../../../../../nimloth-docs/Forlustliggare_Anteckning_2026-08-19.md");

  const procedureStart = step("FÖRKONTROLL 1/2 — skuggskuld (reverse_shadow_write_log)");
  const debt = await getShadowDebt(pool);
  console.log(`  FAILED-poster: ${debt.failedCount}, lagSeconds: ${debt.lagSeconds}, avgSuccessDurationMs: ${debt.avgSuccessDurationMs}`);

  step("FÖRKONTROLL 2/2 — paritetsdiff åt båda håll (spawnad underprocess, fhir-facade)");
  const diff = await runDiffScript();
  console.log(`  paritetsdiff-processen tog ${diff.durationMs} ms (varav ~${TSX_COLDSTART_BASELINE_MS} ms uppskattad tsx-kallstart)`);
  const diffLogicMs = Math.max(0, diff.durationMs - TSX_COLDSTART_BASELINE_MS);

  step(`BESLUT — växla ${domain}/${careUnit} till LEGACY_ONLY, beställd av ${updatedBy}`);

  const switchStart = step(`VÄXLING — PUT /routing/${domain}/${careUnit}`);
  const resp = await fetch(`${GATEWAY_URL}/routing/${domain}/${careUnit}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ direction: "LEGACY_ONLY", updated_by: updatedBy }),
  });
  const switchEnd = Date.now();
  if (resp.status !== 200) {
    console.error(`  FEL: PUT gav status ${resp.status}`);
    process.exit(1);
  }
  console.log(`  PUT-anropet tog ${switchEnd - switchStart} ms`);

  const confirmStart = step("BEKRÄFTELSE — läs tillbaka routing");
  const readBack = (await fetch(`${GATEWAY_URL}/routing/${domain}/${careUnit}`).then((r) => r.json())) as { direction: string };
  if (readBack.direction !== "LEGACY_ONLY") {
    console.error(`  FEL: routing läser tillbaka som ${readBack.direction}, förväntade LEGACY_ONLY`);
    process.exit(1);
  }
  console.log(`  routing bekräftad: ${readBack.direction}`);
  const confirmEnd = Date.now();

  const exportStart = step("EXPORTPAKETETS GENERERING (in-process, samma paket — ingen andra tsx-kallstart)");
  const lossLedgerContent = await readFile(lossLedgerPath, "utf8");
  const manifest = await generateExportPackage(
    {
      pool, legacyClient, openEhrClient, domain,
      lossLedgerPath, lossLedgerContent, nowIso: new Date().toISOString(),
    },
    ehrId, outDir,
  );
  const exportEnd = Date.now();
  console.log(`  exportpaket: ${manifest.itemCount} poster, ${exportEnd - exportStart} ms`);

  const procedureEnd = exportEnd;
  step("KLART");

  const totalLogicMs =
    (procedureEnd - procedureStart) - (diff.durationMs - diffLogicMs); // dra bort diffens uppskattade kallstart ur totalen

  console.log(`\n=== Väggklocka (denna procedur, exklusive skriptets EGEN tsx-kallstart — mät den externt med \`time\`) ===`);
  console.log(`Förkontroll — skuggskuld:      (del av totalen, <5 ms typiskt)`);
  console.log(`Förkontroll — paritetsdiff:    ${diff.durationMs} ms totalt (varav ~${diffLogicMs} ms logik, ~${TSX_COLDSTART_BASELINE_MS} ms tsx-kallstart)`);
  console.log(`Växling (PUT):                 ${switchEnd - switchStart} ms`);
  console.log(`Bekräftelse:                   ${confirmEnd - confirmStart} ms`);
  console.log(`Exportpaketets generering:     ${exportEnd - exportStart} ms (${manifest.itemCount} poster)`);
  console.log(`--`);
  console.log(`PROCEDUR TOTALT (denna process, exkl. egen tsx-start): ${procedureEnd - procedureStart} ms`);
  console.log(`PROCEDUR, LOGIK UTAN VERKTYGSOVERHEAD (exkl. diffens tsx-kallstart också): ${totalLogicMs} ms`);

  await pool.end();
}

main().catch((err) => {
  console.error("fatalt fel:", err);
  process.exit(1);
});
