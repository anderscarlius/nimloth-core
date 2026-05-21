import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import {
  listTemplates,
  uploadOpt,
  EhrbaseError,
} from "../ehrbase-client.js";
import { TARGET_TEMPLATES, EHRBASE_BASE_URL } from "../config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, "..", "..");
const REPO_ROOT = resolve(PKG_ROOT, "..", "..");
const OPT_DIR = join(REPO_ROOT, "infra", "openehr", "templates");
const ARCHETYPE_DIR = join(REPO_ROOT, "infra", "openehr", "archetypes");

type Status = "LOADED" | "OPT_READY" | "NEEDS_BUILD";

interface Row {
  templateId: string;
  status: Status;
  archetypes: string[];
  optFile?: string;
  notat: string;
}

function listOpts(): { file: string; templateLikeName: string }[] {
  if (!existsSync(OPT_DIR)) return [];
  return readdirSync(OPT_DIR)
    .filter((f) => f.endsWith(".opt.xml") || f.endsWith(".opt"))
    .map((file) => ({
      file,
      templateLikeName: file
        .replace(/\.opt(\.xml)?$/, "")
        .replace(/\.v\d+$/, ""),
    }));
}

function listArchetypes(): string[] {
  if (!existsSync(ARCHETYPE_DIR)) return [];
  return readdirSync(ARCHETYPE_DIR).filter((f) => f.endsWith(".adl"));
}

function archetypesFor(templateId: string, all: string[]): string[] {
  const map: Record<string, string[]> = {
    primary_care_encounter: ["encounter", "blood_pressure", "pulse"],
    vital_signs: ["blood_pressure", "pulse", "body_temperature", "body_weight"],
    lab_order: ["service_request", "laboratory_test_request"],
    lab_result: ["laboratory_test_result", "laboratory_test_analyte"],
    problem_diagnosis: ["problem_diagnosis"],
    medication_statement: ["medication_summary", "medication_statement"],
    referral: ["referral"],
    specialist_consultation: ["encounter", "clinical_synopsis"],
    care_plan: ["care_plan", "goal"],
    discharge_summary: ["clinical_synopsis", "discharge_summary"],
  };
  const keywords = map[templateId] ?? [templateId];
  return all.filter((a) =>
    keywords.some((kw) => a.toLowerCase().includes(kw.toLowerCase())),
  );
}

async function inventoryOnce(): Promise<Row[]> {
  const loaded = await listTemplates();
  const loadedIds = new Set(loaded.map((t) => t.template_id));
  const opts = listOpts();
  const allArchetypes = listArchetypes();

  const rows: Row[] = [];
  for (const id of TARGET_TEMPLATES) {
    const matchingOpt = opts.find(
      (o) =>
        o.templateLikeName === id ||
        o.templateLikeName.startsWith(`${id}.`) ||
        // medication_summary OPT maps loosely to medication_statement
        (id === "medication_statement" &&
          o.templateLikeName.startsWith("medication_summary")),
    );
    const arch = archetypesFor(id, allArchetypes);

    let status: Status = "NEEDS_BUILD";
    let notat = "";
    if (loadedIds.has(id)) {
      status = "LOADED";
      notat = "Template hittad i EHRbase.";
    } else if (matchingOpt) {
      status = "OPT_READY";
      notat = `OPT på disk: ${matchingOpt.file}.`;
    } else if (arch.length > 0) {
      notat = `Arketyper finns lokalt men ingen OPT byggd.`;
    } else {
      notat = "Inga arketyper hittade lokalt – kräver CKM-hämtning.";
    }

    rows.push({
      templateId: id,
      status,
      archetypes: arch,
      optFile: matchingOpt?.file,
      notat,
    });
  }

  return rows;
}

async function tryLoadOptReady(rows: Row[]): Promise<Row[]> {
  for (const row of rows) {
    if (row.status !== "OPT_READY" || !row.optFile) continue;
    const optPath = join(OPT_DIR, row.optFile);
    try {
      const xml = readFileSync(optPath, "utf-8");
      await uploadOpt(xml);
      row.status = "LOADED";
      row.notat += " (laddad just nu)";
    } catch (err) {
      const msg = err instanceof EhrbaseError ? `${err.status}: ${err.body.slice(0, 200)}` : String(err);
      row.notat += ` (load FAIL: ${msg})`;
    }
  }
  return rows;
}

function buildMarkdown(rows: Row[]): string {
  const counts = {
    LOADED: rows.filter((r) => r.status === "LOADED").length,
    OPT_READY: rows.filter((r) => r.status === "OPT_READY").length,
    NEEDS_BUILD: rows.filter((r) => r.status === "NEEDS_BUILD").length,
  };
  const ts = new Date().toISOString();
  let md = `# SDG-01 Template Status\n\n`;
  md += `Genererad: ${ts}\n`;
  md += `EHRbase: ${EHRBASE_BASE_URL}\n\n`;
  md += `## Sammanfattning\n\n`;
  md += `| Status | Antal |\n|---|---:|\n`;
  md += `| LOADED | ${counts.LOADED} |\n`;
  md += `| OPT_READY (kan laddas) | ${counts.OPT_READY} |\n`;
  md += `| NEEDS_BUILD | ${counts.NEEDS_BUILD} |\n\n`;
  md += `## Per template\n\n`;
  md += `| Template-ID | Status | OPT-fil | Lokala arketyper | Notat |\n`;
  md += `|---|---|---|---|---|\n`;
  for (const r of rows) {
    const arch =
      r.archetypes.length > 0 ? r.archetypes.join("<br>") : "—";
    md += `| \`${r.templateId}\` | ${r.status} | ${r.optFile ?? "—"} | ${arch} | ${r.notat} |\n`;
  }
  md += `\n## Kritisk väg till SDG-02\n\n`;
  const needed = rows.filter(
    (r) => r.status !== "LOADED" && (r.templateId === "vital_signs" || r.templateId === "lab_result"),
  );
  if (needed.length === 0) {
    md += `Inga blockers. SDG-02 (round-trip Fas 0) kan starta.\n`;
  } else {
    md += `SDG-02 kräver minst T02 (vital_signs) och T04 (lab_result) som LOADED.\n\n`;
    md += `Saknas: ${needed.map((r) => r.templateId).join(", ")}.\n\n`;
    md += `Nästa steg:\n`;
    md += `1. Hämta saknade ADL-arketyper från CKM (https://ckm.openehr.org).\n`;
    md += `2. Skapa OPT-templates (sammansatta) med relevanta arketyper.\n`;
    md += `3. Kör \`pnpm openehr:compile\` för att kompilera ADL→OPT.\n`;
    md += `4. Kör \`pnpm openehr:load-templates\` (eller \`pnpm dev inventory\` igen) för att ladda.\n`;
  }
  return md;
}

export async function runInventory(_args: string[]): Promise<void> {
  console.log(`Inventerar templates mot ${EHRBASE_BASE_URL}…`);
  let rows = await inventoryOnce();
  rows = await tryLoadOptReady(rows);
  // Refresh LOADED-set after upload attempts
  const refreshed = await listTemplates();
  const loadedIds = new Set(refreshed.map((t) => t.template_id));
  for (const r of rows) {
    if (loadedIds.has(r.templateId) && r.status !== "LOADED") {
      r.status = "LOADED";
    }
  }

  const md = buildMarkdown(rows);
  const outDir = join(PKG_ROOT, "inventering");
  const outPath = join(outDir, "template_status.md");
  writeFileSync(outPath, md, "utf-8");
  console.log(`Rapport skriven: ${outPath}`);
  for (const r of rows) {
    console.log(`  ${r.status.padEnd(12)} ${r.templateId}`);
  }
}
