// SDG-07 — scale to 1 000 synthetic patients.
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { generateTimelines } from "../engine/TimelineGenerator.js";
import { loadTimelines, type PatientLoadResult } from "../loader/LoadPipeline.js";
import { spotCheck } from "../loader/RoundTripVerifier.js";
import { runAql } from "../ehrbase-client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, "..", "..");
const DATA_DIR = join(PKG_ROOT, "data");

interface Batch {
  profile: string;
  count: number;
  seed: number;
}

// Spec distribution adjusted to exactly 1000 incl. Marianne.
const BATCHES: Batch[] = [
  { profile: "diabetes_typ2",   count: 110, seed: 100 },
  { profile: "hypertoni",       count: 130, seed: 200 },
  { profile: "hjartsvikt",      count: 90,  seed: 300 },
  { profile: "kol",             count: 90,  seed: 400 },
  { profile: "anemi",           count: 80,  seed: 500 },
  { profile: "uvi",             count: 110, seed: 600 },
  { profile: "depression",      count: 100, seed: 700 },
  { profile: "brostsmarta",     count: 90,  seed: 800 },
  { profile: "ryggsmarta",      count: 90,  seed: 900 },
  { profile: "aldre_multisjuk", count: 109, seed: 1000 },
];

async function loadMarianne(): Promise<PatientLoadResult> {
  console.log("\n=== Marianne Lindqvist (seed=42) ===");
  const tl = generateTimelines({
    profileId: "aldre_multisjuk",
    count: 1,
    seed: 42,
    forcePatientId: "marianne-lindqvist-syn-001",
  });
  const results = await loadTimelines(tl);
  const r = results[0];
  console.log(`  ehr_id=${r.ehrId}  ${r.compositionUids.length} compositions  fails=${r.failed}`);
  return r;
}

async function runBatch(b: Batch): Promise<PatientLoadResult[]> {
  console.log(`\n=== ${b.profile} × ${b.count} (seed=${b.seed}) ===`);
  const t0 = Date.now();
  const timelines = generateTimelines({
    profileId: b.profile,
    count: b.count,
    seed: b.seed,
  });
  const events = timelines.reduce((s, t) => s + t.events.length, 0);
  console.log(`  Generated ${timelines.length} timelines, ${events} events.`);

  const results = await loadTimelines(timelines);
  const elapsed = Date.now() - t0;
  const ok = results.filter((r) => r.failed === 0).length;
  const uids = results.reduce((s, r) => s + r.compositionUids.length, 0);
  console.log(`  Loaded ${ok}/${results.length} patients (${uids} compositions) in ${(elapsed / 1000).toFixed(1)}s.`);
  return results;
}

function appendManifest(results: PatientLoadResult[], profile: string, seed: number): void {
  const manifestPath = join(DATA_DIR, "population_manifest.json");
  let manifest: { patients: Array<Record<string, unknown>> } = { patients: [] };
  if (existsSync(manifestPath)) {
    manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  }
  for (const r of results) {
    if (!r.ehrId || r.ehrId.startsWith("DRY-")) continue;
    manifest.patients.push({
      ehrId: r.ehrId,
      patientId: r.patientId,
      profileId: profile,
      seed,
      compositionCount: r.compositionUids.length,
      failed: r.failed,
      generatedAt: r.startedAt,
    });
  }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

async function main() {
  mkdirSync(DATA_DIR, { recursive: true });

  const allResults: { profile: string; results: PatientLoadResult[] }[] = [];

  // Step 1: Marianne
  const marianne = await loadMarianne();
  allResults.push({ profile: "aldre_multisjuk (Marianne)", results: [marianne] });
  appendManifest([marianne], "aldre_multisjuk", 42);

  // Step 2: per-profile batches
  for (const b of BATCHES) {
    const results = await runBatch(b);
    appendManifest(results, b.profile, b.seed);
    allResults.push({ profile: b.profile, results });
    // Small breather between profiles
    await new Promise((r) => setTimeout(r, 5000));
  }

  // Step 3: AQL totals
  console.log("\n=== AQL verification ===");
  const totalEhrs = await runAql<unknown[][]>("SELECT COUNT(e) FROM EHR e");
  const totalComps = await runAql<unknown[][]>(
    "SELECT COUNT(c) FROM EHR e CONTAINS COMPOSITION c",
  );
  const ehrCount = Number(totalEhrs.rows?.[0]?.[0] ?? 0);
  const compCount = Number(totalComps.rows?.[0]?.[0] ?? 0);
  console.log(`  EHR rows: ${ehrCount}`);
  console.log(`  COMPOSITION rows: ${compCount}`);

  // Step 4: Spot check 50 random patients
  const allLoaded = allResults.flatMap((g) => g.results);
  const verifier = await spotCheck(allLoaded, 50);
  console.log(`  Spot check: ${verifier.okCount}/${verifier.totalCount} OK (${(verifier.okRatio * 100).toFixed(0)}%)`);

  // Step 5: Population report
  const totalPatients = allLoaded.length;
  const totalCompositions = allLoaded.reduce((s, r) => s + r.compositionUids.length, 0);
  const totalFailed = allLoaded.reduce((s, r) => s + r.failed, 0);

  let md = `# SDG-07 — Populationsrapport\n\n`;
  md += `Genererad: ${new Date().toISOString()}\n`;
  md += `EHRbase: http://192.168.1.189:11401/ehrbase\n\n`;
  md += `## Sammanfattning\n\n`;
  md += `- Patienter: **${totalPatients}**\n`;
  md += `- Compositions: **${totalCompositions}**\n`;
  md += `- Fel-events: ${totalFailed}\n`;
  md += `- AQL COUNT(EHR): ${ehrCount}\n`;
  md += `- AQL COUNT(COMPOSITION): ${compCount}\n`;
  md += `- Spot-check 50 patienter: ${verifier.okCount}/${verifier.totalCount} OK (${(verifier.okRatio * 100).toFixed(0)}%)\n\n`;
  md += `## Per profil\n\n`;
  md += `| Profil | Patienter | Compositions | Fel |\n|---|---:|---:|---:|\n`;
  for (const g of allResults) {
    const ok = g.results.filter((r) => r.failed === 0).length;
    const comps = g.results.reduce((s, r) => s + r.compositionUids.length, 0);
    const fails = g.results.reduce((s, r) => s + r.failed, 0);
    md += `| ${g.profile} | ${ok}/${g.results.length} | ${comps} | ${fails} |\n`;
  }
  md += `\n## Marianne\n\n`;
  md += `- ehr_id: \`${marianne.ehrId}\`\n`;
  md += `- patient_id: \`marianne-lindqvist-syn-001\`\n`;
  md += `- Compositions: ${marianne.compositionUids.length}\n`;

  const reportPath = join(DATA_DIR, "population_report.md");
  writeFileSync(reportPath, md);
  console.log(`\nReport: ${reportPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
