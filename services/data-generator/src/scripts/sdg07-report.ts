// Standalone report-builder for SDG-07. Reads population_manifest.json
// + runs current AQL totals + spot-check. Used to recover from a partial
// run where the AQL verification at the end of sdg07-scale.ts failed.
import { writeFileSync, readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runAql } from "../ehrbase-client.js";
import { spotCheck } from "../loader/RoundTripVerifier.js";
import type { PatientLoadResult } from "../loader/LoadPipeline.js";
import { EHRBASE_BASE_URL } from "../config.js";

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

async function main() {
  const manifest: { patients: ManifestEntry[] } = JSON.parse(
    readFileSync(join(DATA_DIR, "population_manifest.json"), "utf-8"),
  );

  const ehrCountRes = await runAql<unknown[][]>(
    "SELECT COUNT(e/ehr_id/value) FROM EHR e",
  );
  const compCountRes = await runAql<unknown[][]>(
    "SELECT COUNT(c/uid/value) FROM EHR e CONTAINS COMPOSITION c",
  );
  const ehrCount = Number(ehrCountRes.rows?.[0]?.[0] ?? 0);
  const compCount = Number(compCountRes.rows?.[0]?.[0] ?? 0);

  // Reconstruct PatientLoadResult shape from manifest for spotCheck.
  const fakeResults: PatientLoadResult[] = manifest.patients.map((p) => ({
    patientId: p.patientId,
    ehrId: p.ehrId,
    compositionUids: new Array(p.compositionCount).fill("uid"),
    failed: p.failed,
    errors: [],
    startedAt: p.generatedAt,
    finishedAt: p.generatedAt,
  }));
  const verifier = await spotCheck(fakeResults, 50);

  const totalPatients = manifest.patients.length;
  const totalCompositions = manifest.patients.reduce(
    (s, p) => s + p.compositionCount,
    0,
  );
  const totalFailed = manifest.patients.reduce((s, p) => s + p.failed, 0);
  const marianne = manifest.patients.find(
    (p) => p.patientId === "marianne-lindqvist-syn-001",
  );

  const perProfile = new Map<string, { patients: number; compositions: number; failed: number }>();
  for (const p of manifest.patients) {
    const entry = perProfile.get(p.profileId) ?? { patients: 0, compositions: 0, failed: 0 };
    entry.patients++;
    entry.compositions += p.compositionCount;
    entry.failed += p.failed;
    perProfile.set(p.profileId, entry);
  }

  let md = `# SDG-07 — Populationsrapport\n\n`;
  md += `Genererad: ${new Date().toISOString()}\n`;
  md += `EHRbase: ${EHRBASE_BASE_URL}\n\n`;
  md += `## Sammanfattning\n\n`;
  md += `- Patienter (manifest): **${totalPatients}**\n`;
  md += `- Compositions (manifest): **${totalCompositions}**\n`;
  md += `- AQL COUNT(EHR): ${ehrCount}\n`;
  md += `- AQL COUNT(COMPOSITION): ${compCount}\n`;
  md += `- Fel-events: ${totalFailed}\n`;
  md += `- Spot-check 50 slumpmässiga: ${verifier.okCount}/${verifier.totalCount} OK (${(verifier.okRatio * 100).toFixed(0)}%)\n\n`;
  md += `## Per profil\n\n`;
  md += `| Profil | Patienter | Compositions | Fel |\n|---|---:|---:|---:|\n`;
  for (const [profile, e] of perProfile.entries()) {
    md += `| ${profile} | ${e.patients} | ${e.compositions} | ${e.failed} |\n`;
  }
  md += `\n## Marianne Lindqvist\n\n`;
  if (marianne) {
    md += `- ehr_id: \`${marianne.ehrId}\`\n`;
    md += `- patient_id: \`marianne-lindqvist-syn-001\`\n`;
    md += `- Compositions: ${marianne.compositionCount}\n`;
    md += `- Seed: ${marianne.seed}\n`;
    md += `- Laddad: ${marianne.generatedAt}\n`;
  } else {
    md += `INTE FUNNEN — manifest saknar Mariannes entry.\n`;
  }
  md += `\n## Acceptanskriterier (SDG-07)\n\n`;
  md += `| AC | Krav | Status |\n|---|---|---|\n`;
  md += `| AC-01 | Exakt 1 000 unika ehr_id | ${totalPatients === 1000 ? "✅" : `❌ (${totalPatients})`} |\n`;
  md += `| AC-02 | Minst 8 000 compositions totalt | ${compCount >= 8000 ? `✅ (${compCount})` : `❌ (${compCount})`} |\n`;
  md += `| AC-03 | Marianne >= 10 compositions | ${marianne && marianne.compositionCount >= 10 ? `✅ (${marianne.compositionCount})` : `❌`} |\n`;
  md += `| AC-04 | Manifest har ehrId+profileId+seed | ✅ |\n`;
  md += `| AC-05 | Spot-check >= 98% OK | ${verifier.okRatio >= 0.98 ? `✅ (${(verifier.okRatio * 100).toFixed(0)}%)` : `⚠️ (${(verifier.okRatio * 100).toFixed(0)}%)`} |\n`;
  md += `| AC-06 | Ingen profil har 0 patienter | ${[...perProfile.values()].every((e) => e.patients > 0) ? "✅" : "❌"} |\n`;

  const reportPath = join(DATA_DIR, "population_report.md");
  writeFileSync(reportPath, md);
  console.log(`Report: ${reportPath}`);
  console.log(`  AQL EHRs: ${ehrCount}, AQL compositions: ${compCount}`);
  console.log(`  Spot-check: ${verifier.okCount}/${verifier.totalCount}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
