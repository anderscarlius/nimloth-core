// Rebuild population_manifest.json från live EHRbase-state.
//
// Behövs när sdg07-scale.ts har körts på en pre-existerande
// manifest-fil (append-only) eller efter wipe-reload-sekvenser där
// manifestet ackumulerar orphan-entries.
//
// Strategin: queriera EHRbase, hämta varje EHRs subject_id + composition-
// count, inferra profile från patient_id-konventionen <profile>-<seed>-<i>
// (eller marianne-lindqvist-syn-001 / ingrid-svensson-syn-001 för
// ankarpatienter).

import { writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runAql } from "../ehrbase-client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, "..", "..");
const DATA_DIR = join(PKG_ROOT, "data");

interface ManifestEntry {
  ehrId: string;
  patientId: string;
  profileId: string;
  seed: number;
  compositionCount: number;
  failed: number;
  generatedAt: string;
}

function inferProfileAndSeed(patientId: string): { profileId: string; seed: number } {
  if (patientId === "marianne-lindqvist-syn-001") {
    return { profileId: "aldre_multisjuk", seed: 42 };
  }
  if (patientId === "ingrid-svensson-syn-001") {
    return { profileId: "fas0_ingrid", seed: 0 };
  }
  // Format: <profile>-<seed>-<index>. Profile kan innehålla _ och - (t.ex.
  // aldre_multisjuk). Vi splittar från höger.
  const parts = patientId.split("-");
  if (parts.length < 3) return { profileId: "unknown", seed: -1 };
  const seed = Number(parts[parts.length - 2]);
  const profileId = parts.slice(0, parts.length - 2).join("-");
  return { profileId, seed: Number.isFinite(seed) ? seed : -1 };
}

async function main(): Promise<void> {
  console.log("Hämtar EHR + subject_id-lista...");
  const ehrs = await runAql<unknown[][]>(
    "SELECT e/ehr_id/value, e/ehr_status/subject/external_ref/id/value FROM EHR e",
  );
  console.log(`  ${(ehrs.rows ?? []).length} EHRer i EHRbase`);

  console.log("Hämtar composition-count per EHR...");
  const compCounts = await runAql<unknown[][]>(
    "SELECT e/ehr_id/value, COUNT(c/uid/value) FROM EHR e CONTAINS COMPOSITION c",
  );
  const countByEhr = new Map<string, number>();
  for (const r of compCounts.rows ?? []) {
    countByEhr.set(String((r as unknown[])[0]), Number((r as unknown[])[1]));
  }

  const entries: ManifestEntry[] = [];
  const generatedAt = new Date().toISOString();
  for (const r of ehrs.rows ?? []) {
    const ehrId = String((r as unknown[])[0]);
    const patientId = String((r as unknown[])[1] ?? "");
    if (!patientId) continue;
    const { profileId, seed } = inferProfileAndSeed(patientId);
    entries.push({
      ehrId,
      patientId,
      profileId,
      seed,
      compositionCount: countByEhr.get(ehrId) ?? 0,
      failed: 0,
      generatedAt,
    });
  }

  entries.sort((a, b) => a.patientId.localeCompare(b.patientId));

  const manifestPath = join(DATA_DIR, "population_manifest.json");
  writeFileSync(manifestPath, JSON.stringify({ patients: entries }, null, 2));

  console.log(`Skrivet ${manifestPath} med ${entries.length} entries.`);
  const counts: Record<string, number> = {};
  for (const e of entries) {
    counts[e.profileId] = (counts[e.profileId] ?? 0) + 1;
  }
  console.log("Per profil:");
  for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(20)} ${v}`);
  }
  console.log(`Total compositions: ${entries.reduce((s, e) => s + e.compositionCount, 0)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
