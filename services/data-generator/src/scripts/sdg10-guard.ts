// SDG-10 AC5 GUARD — empirical pre-wipe check.
//
// Loads a small smoke-pop (~50 patients) through the NEW composers (lab/med/
// diag routed to domain OPTs per EVENT_SHAPE_MAP). Then runs the 9 honest
// AQL queries and verifies REALISTIC population-tal — not just "branches > 0".
//
// Why: first full-pop pass through äkta OPTs. A path-bug in an AQL rewrite
// could quietly zero a query across all 1000 patients after AC5's wipe — too
// late to discover post-mortem. Cheaper to catch at 50.
//
// Discrimination: the honest AQL queries filter on archetype/template_id, so
// they MATCH ONLY the new compositions. Pre-existing 1006-pop fixture data
// is invisible to these queries — natural isolation, no wipe needed yet.
//
// Run:  pnpm --filter @nimloth-core/data-generator exec tsx \
//         src/scripts/sdg10-guard.ts

import { generateTimelines } from "../engine/TimelineGenerator.js";
import { loadTimelines } from "../loader/LoadPipeline.js";
import { QUERIES } from "../queries/aql_queries.js";
import { runQuery } from "../queries/AqlRunner.js";

interface Batch {
  profileId: string;
  count: number;
  seed: number;
}

// High-signal mix: triggers HbA1c, dropout, polyfarmaci, multisjuk in 50 pts.
const GUARD_BATCHES: Batch[] = [
  { profileId: "diabetes_typ2", count: 20, seed: 9_100 },
  { profileId: "hypertoni", count: 5, seed: 9_200 },
  { profileId: "aldre_multisjuk", count: 15, seed: 9_300 },
  { profileId: "uvi", count: 10, seed: 9_600 },
];

const HONEST_IDS = ["AQL-01", "AQL-02", "AQL-04", "AQL-06", "AQL-07", "AQL-10", "AQL-13", "AQL-14", "AQL-15"];

// Realistic-population thresholds for 50-patient guard. If any query fails to
// meet its threshold here, a path-bug or invariant breach is likely — STOP
// before wiping the 1006-pop.
const GUARD_THRESHOLDS: Record<string, number> = {
  "AQL-01": 15,   // 20 diabetes → expect ≥15 (some pathway branches skip diag)
  "AQL-02": 3,    // some HbA1c > 70 in diabetes branches
  "AQL-04": 5,    // aldre_multisjuk × 15 → expect ≥5 polyfarmaci
  "AQL-06": 1,    // at least one dropout branch in diabetes
  "AQL-07": 10,   // most diabetes pts have multi-lab trends
  "AQL-10": 1,    // at least one responder branch
  "AQL-13": 1,    // at least one ≥7-med patient (aldre_multisjuk likely)
  "AQL-14": 1,    // at least one nonresponder branch
  "AQL-15": 1,    // ≥1 analyte bucket (HBA1C)
};

async function main(): Promise<void> {
  console.log("=== SDG-10 AC5 GUARD ===");
  console.log("Loading smoke-pop via new composers (route lab/med/diag through domain OPTs).");

  let totalPatients = 0;
  let totalCompositions = 0;
  for (const b of GUARD_BATCHES) {
    const t0 = Date.now();
    const timelines = generateTimelines(b);
    const results = await loadTimelines(timelines);
    const okPats = results.filter((r) => r.failed === 0).length;
    const comps = results.reduce((s, r) => s + r.compositionUids.length, 0);
    const failed = results.reduce((s, r) => s + r.failed, 0);
    totalPatients += okPats;
    totalCompositions += comps;
    console.log(
      `  ${b.profileId.padEnd(20)} ${okPats}/${b.count} pts, ${comps} comps, ${failed} failed, ${((Date.now() - t0) / 1000).toFixed(1)}s`,
    );
    if (failed > 0) {
      console.log(
        `    sample errors: ${results.find((r) => r.errors.length > 0)?.errors.slice(0, 2).join(" | ")}`,
      );
    }
  }
  console.log(`\nLoaded ${totalPatients} pts, ${totalCompositions} compositions.\n`);

  console.log("=== Honest AQL queries (post-load) ===");
  const failures: string[] = [];
  for (const id of HONEST_IDS) {
    const spec = QUERIES.find((q) => q.id === id);
    if (!spec) {
      failures.push(`${id}: missing from QUERIES`);
      continue;
    }
    const r = await runQuery(spec);
    const threshold = GUARD_THRESHOLDS[id];
    const status =
      r.error
        ? `FAIL — ${r.error}`
        : r.resultCount >= threshold
          ? `OK  (${r.resultCount} ≥ ${threshold})`
          : `WARN (${r.resultCount} < threshold ${threshold})`;
    console.log(`  ${id.padEnd(7)} ${status}  [${r.executionTimeMs} ms]`);
    if (r.error || r.resultCount < threshold) {
      failures.push(`${id}: ${r.error ?? `${r.resultCount}/${threshold}`}`);
    }
  }

  if (failures.length > 0) {
    console.log("\n=== GUARD FAILED ===");
    for (const f of failures) console.log("  " + f);
    console.log("\nDO NOT wipe — investigate path bug or threshold mis-calibration.");
    process.exit(2);
  }
  console.log("\n=== GUARD GREEN — safe to wipe + full-pop reload ===");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
