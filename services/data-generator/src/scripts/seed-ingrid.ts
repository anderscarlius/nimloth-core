// =====================================================================
// KU Reseed — idempotent återställning av Ingrids live-skiva.
//
// Patient-id:    ingrid-andersson-syn-001
// Manifest-katalog: services/data-generator/seed/ingrid/
//
// Säkrar att Ingrids 19 kompositioner finns i EHRbase, sedan kör projektor
// för att fylla omop.drug_exposure + omop.measurement med live_transform-
// lineage.
//
// IDEMPOTENS:
//   - EHR: createEhr() återanvänder existerande om subject_id finns.
//   - Komposition: AQL räknar kompositioner med EXAKT composer.name; POST
//     bara om 0 finns. Två körningar → samma slutläge, inga dubbletter.
//
// Skriptet POST:ar INTE projektorn — användaren måste köra den efteråt:
//   pnpm --filter @nimloth-core/omop-projector exec tsx src/cli.ts \
//     --patient ingrid-andersson-syn-001 --no-migrate
//
// (Vi separerar reseed från re-projektion eftersom de har olika
// idempotens-stories: reseed dedup:erar via composer-strängar i CDR;
// projektorn dedup:erar via UNIQUE-constraints i omop.*.)
// =====================================================================

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createEhr, postCompositionCanonical, runAql } from "../ehrbase-client.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// PATIENT_ID kan overrides via env för idempotens-testning på temporär patient.
// Default är den riktiga Ingrid.
const PATIENT_ID = process.env.SEED_PATIENT_ID ?? "ingrid-andersson-syn-001";
const SEED_DIR = path.resolve(__dirname, "..", "..", "seed", "ingrid");

interface CompositionFile {
  filename: string;
  composer_name: string;
  template_id: string;
  start_time: string;
  json: Record<string, unknown>;
}

function loadManifest(): CompositionFile[] {
  const files = readdirSync(SEED_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();
  const out: CompositionFile[] = [];
  for (const f of files) {
    const json = JSON.parse(readFileSync(path.join(SEED_DIR, f), "utf-8")) as Record<string, unknown>;
    const composer = (json.composer as { name?: string } | undefined)?.name;
    const archetypeDetails = json.archetype_details as { template_id?: { value?: string } } | undefined;
    const tpl = archetypeDetails?.template_id?.value;
    const context = json.context as { start_time?: { value?: string } } | undefined;
    const startTime = context?.start_time?.value;
    if (!composer || !tpl || !startTime) {
      throw new Error(`Seed-fil ${f} saknar composer/template/start_time — har manifestet manipulerats?`);
    }
    out.push({
      filename: f,
      composer_name: composer,
      template_id: tpl,
      start_time: startTime,
      json,
    });
  }
  return out;
}

async function compositionExists(
  ehrId: string,
  composerName: string,
): Promise<boolean> {
  // EHRbase AQL stöder = för exakt match. composer.name är audit-fält, inte
  // klinisk data — denna AQL är housekeeping (analog till idempotens-checken
  // i UNIQUE-constraints), inte en klinisk query.
  const escaped = composerName.replace(/'/g, "''");
  const aql = `SELECT COUNT(c/uid/value) FROM EHR e CONTAINS COMPOSITION c WHERE e/ehr_id/value = '${ehrId}' AND c/composer/name = '${escaped}'`;
  const res = await runAql<unknown[]>(aql);
  const row = (res.rows as unknown[][])[0];
  const count = row ? Number(row[0]) : 0;
  return count > 0;
}

async function main(): Promise<void> {
  const log = (...args: unknown[]) => console.log("[seed-ingrid]", ...args);

  log(`patient=${PATIENT_ID}  seed_dir=${SEED_DIR}`);

  // 1. EHR
  const ehrId = await createEhr(PATIENT_ID);
  log(`EHR-id: ${ehrId} (skapad eller återanvänd)`);

  // 2. Manifest
  const manifest = loadManifest();
  log(`Manifest: ${manifest.length} kompositioner`);

  // 3. POST + dedup
  let inserted = 0;
  let skipped = 0;
  const insertedComposers: string[] = [];
  const skippedComposers: string[] = [];

  for (const c of manifest) {
    const exists = await compositionExists(ehrId, c.composer_name);
    if (exists) {
      skipped++;
      skippedComposers.push(c.composer_name);
      continue;
    }
    try {
      const newUid = await postCompositionCanonical(ehrId, c.json);
      inserted++;
      insertedComposers.push(`${c.composer_name}  →  ${newUid}`);
    } catch (err) {
      log(`POST FAIL för ${c.filename}: ${(err as Error).message}`);
      throw err;
    }
  }

  // 4. Rapport
  log("");
  log(`═══ Resultat ═══`);
  log(`  Inserted: ${inserted}`);
  log(`  Skipped (redan fanns): ${skipped}`);
  log(`  Total i manifestet: ${manifest.length}`);
  if (inserted > 0) {
    log("");
    log("Insatta kompositioner:");
    for (const c of insertedComposers) log(`  + ${c}`);
  }
  if (skipped > 0 && skipped <= 5) {
    log("");
    log("Hoppade över (matchande composer.name fanns):");
    for (const c of skippedComposers) log(`  · ${c.slice(0, 90)}`);
  }

  // 5. Slutverifiering: räkna kompositioner i EHRbase
  const finalCount = await runAql<unknown[]>(
    `SELECT COUNT(c/uid/value) FROM EHR e CONTAINS COMPOSITION c WHERE e/ehr_id/value = '${ehrId}'`,
  );
  const total = Number(((finalCount.rows as unknown[][])[0] ?? [0])[0]);
  log("");
  log(`Totalt kompositioner i Ingrids EHR efter seed: ${total}`);
  if (total !== manifest.length) {
    log(
      `VARNING: räkningen ${total} matchar inte manifestets ${manifest.length}. Detta är OK om andra historiska kompositioner finns kvar — wipe EHRbase och kör om för rent state.`,
    );
  }

  log("");
  log("Nästa steg:");
  log(`  pnpm --filter @nimloth-core/omop-projector exec tsx src/cli.ts \\`);
  log(`    --patient ${PATIENT_ID} --no-migrate`);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
