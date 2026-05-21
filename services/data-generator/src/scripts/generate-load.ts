// CLI: pnpm generate:load --profile <id> --count <N> [--seed <N>] [--dry-run]
//        [--patient-id <id>]
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { generateTimelines } from "../engine/TimelineGenerator.js";
import { loadTimelines } from "../loader/LoadPipeline.js";
import { spotCheck } from "../loader/RoundTripVerifier.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, "..", "..");
const DATA_DIR = join(PKG_ROOT, "data");

interface CliArgs {
  profile: string;
  count: number;
  seed: number;
  dryRun: boolean;
  patientId?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: Partial<CliArgs> = { seed: 100, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === "--profile") { args.profile = v; i++; }
    else if (k === "--count") { args.count = Number(v); i++; }
    else if (k === "--seed") { args.seed = Number(v); i++; }
    else if (k === "--dry-run") { args.dryRun = true; }
    else if (k === "--patient-id") { args.patientId = v; i++; }
  }
  if (!args.profile || !args.count) {
    console.error("Usage: generate:load --profile <id> --count <N> [--seed <N>] [--dry-run] [--patient-id <id>]");
    process.exit(1);
  }
  return args as CliArgs;
}

export async function runGenerateLoad(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  console.log(`[generate:load] profile=${args.profile} count=${args.count} seed=${args.seed} dry-run=${args.dryRun}${args.patientId ? ` patient-id=${args.patientId}` : ""}`);

  const timelines = generateTimelines({
    profileId: args.profile,
    count: args.count,
    seed: args.seed,
    forcePatientId: args.patientId,
  });

  const totalEvents = timelines.reduce((s, t) => s + t.events.length, 0);
  console.log(`  Generated ${timelines.length} timelines, ${totalEvents} events total.`);

  const t0 = Date.now();
  const results = await loadTimelines(timelines, { dryRun: args.dryRun });
  const elapsed = Date.now() - t0;

  const successCount = results.filter((r) => r.failed === 0).length;
  const totalUids = results.reduce((s, r) => s + r.compositionUids.length, 0);
  console.log(`  Loaded ${successCount}/${results.length} patients fully. ${totalUids} compositions in ${(elapsed / 1000).toFixed(1)}s.`);

  // Spot check (skip on dry-run)
  if (!args.dryRun) {
    const verifier = await spotCheck(results, Math.min(5, results.length));
    console.log(`  Spot check: ${verifier.okCount}/${verifier.totalCount} OK (${(verifier.okRatio * 100).toFixed(0)}%)`);
  }

  mkdirSync(DATA_DIR, { recursive: true });
  const reportPath = join(DATA_DIR, `load_report_${args.profile}_seed${args.seed}.json`);
  writeFileSync(
    reportPath,
    JSON.stringify(
      {
        profile: args.profile,
        count: args.count,
        seed: args.seed,
        dryRun: args.dryRun,
        elapsedMs: elapsed,
        results,
      },
      null,
      2,
    ),
  );

  // Append to population_manifest.json
  if (!args.dryRun) {
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
        profileId: args.profile,
        seed: args.seed,
        compositionCount: r.compositionUids.length,
        failed: r.failed,
        generatedAt: r.startedAt,
      });
    }
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  }

  console.log(`  Report: ${reportPath}`);
  if (results.some((r) => r.failed > 0)) {
    process.exit(2);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runGenerateLoad(process.argv.slice(2)).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
