// CLI: pnpm demo:aql              (run all)
//      pnpm demo:aql --id AQL-11   (one)
//      pnpm demo:aql --category C  (one category)
import { writeFileSync, mkdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  QUERIES,
  getQuery,
  getByCategory,
  type AqlSpec,
  type AqlCategory,
} from "./aql_queries.js";
import { runQuery, type AqlRunResult } from "./AqlRunner.js";
import { EHRBASE_BASE_URL } from "../config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, "..", "..");
const OUT_DIR = join(PKG_ROOT, "queries");

function selectQueries(args: string[]): AqlSpec[] {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--id") {
      const q = getQuery(args[i + 1]);
      if (!q) {
        console.error(`Unknown query id: ${args[i + 1]}`);
        process.exit(1);
      }
      return [q];
    }
    if (args[i] === "--category") {
      return getByCategory(args[i + 1] as AqlCategory);
    }
  }
  return QUERIES;
}

function buildMarkdown(results: AqlRunResult[]): string {
  let md = `# SDG-08 — AQL-demofrågor\n\n`;
  md += `Genererad: ${new Date().toISOString()}\n`;
  md += `EHRbase: ${EHRBASE_BASE_URL}\n\n`;
  md += `## Sammanfattning\n\n`;
  md += `| ID | Tier | Titel | Resultat | Tid (ms) |\n|---|---|---|---:|---:|\n`;
  for (const r of results) {
    const spec = QUERIES.find((q) => q.id === r.id)!;
    md += `| ${r.id} | ${spec.tier} | ${r.title} | ${r.error ? "FAIL" : r.resultCount} | ${r.executionTimeMs} |\n`;
  }
  md += `\n## Frågor i detalj\n\n`;
  for (const r of results) {
    const spec = QUERIES.find((q) => q.id === r.id)!;
    md += `### ${r.id} — ${r.title}\n\n`;
    md += `**Kategori:** ${spec.category}\n\n`;
    md += `**Beskrivning:** ${spec.description}\n\n`;
    md += "```aql\n" + spec.aql + "\n```\n\n";
    md += `**Resultat:** ${r.error ? `FAIL — ${r.error}` : `${r.resultCount} rader (${r.rawRowCount} råa)`}, ${r.executionTimeMs} ms\n\n`;
    if (!r.error && r.results.length > 0) {
      const sample = r.results.slice(0, 3);
      md += "Första 3 träffarna:\n\n```json\n" + JSON.stringify(sample, null, 2) + "\n```\n\n";
    }
  }
  return md;
}

async function main() {
  const selected = selectQueries(process.argv.slice(2));
  console.log(`Kör ${selected.length} AQL-frågor mot EHRbase…\n`);

  const results: AqlRunResult[] = [];
  for (const spec of selected) {
    const r = await runQuery(spec);
    results.push(r);
    const tag = r.error ? `FAIL (${r.error})` : `${r.resultCount} rader, ${r.executionTimeMs} ms`;
    console.log(`  ${r.id.padEnd(7)} ${tag}`);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, "query_results.json"), JSON.stringify(results, null, 2));
  writeFileSync(join(OUT_DIR, "aql_demo_queries.md"), buildMarkdown(results));
  console.log(`\nRapport: ${join(OUT_DIR, "aql_demo_queries.md")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
