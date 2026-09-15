// Populationsscreening (Fas C) — batch som kör de deterministiska regelmotorerna
// över HELA den syntetiska populationen och skriver ett aggregat som demo-ytan
// läser. ENGÅNGS-batch (ej i request-vägen) — bounded concurrency (AC1: EHRbase
// är samtidighetsbegränsad på 4-kärnig NAS).
//
// ÄRLIGHET: manifestet saknar ålder → Beers/STOPP-motorn antar äldre (konservativt).
// Därför taggas varje fynd med `kind` så demo-ytan kan särskilja åldersoberoende
// fynd (interaktion/kontraindikation = solida) från Beers/STOPP (ålder antagen).
//
// Kör (lokalt mot Moria):
//   AQL_TEMPLATE_BASE_URL=http://192.168.1.220:11402 npx tsx src/scripts/screen-population.ts

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { AqlClient, TEMPLATES } from "../aql-client.js";
import { runRules, type PatientSnapshot } from "../rules/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MANIFEST = resolve(__dirname, "../../../data-generator/data/population_manifest.json");
const OUT = resolve(__dirname, "../../../dashboard/public/screening-results.json");

const BASE = process.env.AQL_TEMPLATE_BASE_URL ?? "http://192.168.1.220:11402";
const CONCURRENCY = Number(process.env.SCREEN_CONCURRENCY ?? 4);

interface ManifestPatient { ehrId: string; patientId: string; profileId: string; compositionCount: number }
interface MedRow { name: string; atc: string }
interface DiagRow { name: string; icd: string }
interface AllergyRow { substanceName: string; substanceCode: string; criticality: string; reactionType: string }

interface ScreenRow {
  patientId: string;
  profile: string;
  ehrId: string;
  medCount: number;
  diagCount: number;
  findingCount: number;
  maxSeverity: "high" | "moderate" | "low" | null;
  // antal fynd per kind (åldersoberoende vs Beers/STOPP)
  interaction: number;
  contraindication: number;
  beers_stopp: number;
  findings: { severity: string; kind: string; title: string }[];
  failed?: boolean;
}

const SEV_RANK = { high: 3, moderate: 2, low: 1 } as const;

async function screenOne(client: AqlClient, p: ManifestPatient): Promise<ScreenRow> {
  try {
    const [meds, allergies, diags] = await Promise.all([
      client.execute<MedRow>(TEMPLATES.medications, { patient_id: p.patientId }),
      client.execute<AllergyRow>(TEMPLATES.allergies, { patient_id: p.patientId }),
      client.execute<DiagRow>(TEMPLATES.diagnoses, { patient_id: p.patientId }),
    ]);
    const snapshot: PatientSnapshot = {
      patientId: p.patientId,
      age: undefined, // okänd i manifestet → Beers/STOPP antar äldre (konservativt)
      activeMedications: meds.rows.map((m) => ({ atc: m.atc, name: m.name })),
      allergies: allergies.rows.map((a) => ({
        substanceCode: a.substanceCode,
        substanceName: a.substanceName,
        reactionType: a.reactionType,
        criticality: a.criticality,
      })),
    };
    const findings = runRules(snapshot);
    let maxSeverity: ScreenRow["maxSeverity"] = null;
    for (const f of findings) {
      if (!maxSeverity || SEV_RANK[f.severity] > SEV_RANK[maxSeverity]) maxSeverity = f.severity;
    }
    return {
      patientId: p.patientId,
      profile: p.profileId,
      ehrId: p.ehrId,
      medCount: meds.row_count,
      diagCount: diags.row_count,
      findingCount: findings.length,
      maxSeverity,
      interaction: findings.filter((f) => f.kind === "interaction").length,
      contraindication: findings.filter((f) => f.kind === "contraindication").length,
      beers_stopp: findings.filter((f) => f.kind === "beers_stopp").length,
      findings: findings.map((f) => ({ severity: f.severity, kind: f.kind, title: f.title })),
    };
  } catch (err) {
    process.stderr.write(`  FAIL ${p.patientId}: ${err instanceof Error ? err.message : String(err)}\n`);
    return {
      patientId: p.patientId, profile: p.profileId, ehrId: p.ehrId, medCount: 0, diagCount: 0,
      findingCount: 0, maxSeverity: null, interaction: 0, contraindication: 0, beers_stopp: 0,
      findings: [], failed: true,
    };
  }
}

async function main() {
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8")) as { patients: ManifestPatient[] };
  const patients = manifest.patients;
  const client = new AqlClient(BASE);
  process.stdout.write(`Screening ${patients.length} patienter mot ${BASE} (concurrency=${CONCURRENCY})…\n`);

  const t0 = Date.now();
  const results: ScreenRow[] = new Array(patients.length);
  let idx = 0;
  let doneCount = 0;
  async function worker() {
    while (idx < patients.length) {
      const i = idx++;
      results[i] = await screenOne(client, patients[i]);
      if (++doneCount % 100 === 0) process.stdout.write(`  …${doneCount}/${patients.length}\n`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  const elapsedMs = Date.now() - t0;

  const flagged = results.filter((r) => r.findingCount > 0);
  const high = results.filter((r) => r.maxSeverity === "high");
  const byProfile: Record<string, { total: number; flagged: number }> = {};
  for (const r of results) {
    byProfile[r.profile] ??= { total: 0, flagged: 0 };
    byProfile[r.profile].total++;
    if (r.findingCount > 0) byProfile[r.profile].flagged++;
  }

  const output = {
    generatedAt: new Date().toISOString(),
    source: BASE,
    elapsedMs,
    ageNote: "Ålder saknas i manifestet → Beers/STOPP antar äldre (konservativt). Interaktion/kontraindikation är åldersoberoende.",
    ruleScopeNote: "Regelmotorerna är en medveten scopad delmängd (warfarin+SSRI, warfarin+amoxicillin, penicillin-kontraindikation, Beers/STOPP warfarin/SSRI/PPI). Täckningen speglar det.",
    totals: {
      patients: results.length,
      flagged: flagged.length,
      high: high.length,
      withInteraction: results.filter((r) => r.interaction > 0).length,
      withContraindication: results.filter((r) => r.contraindication > 0).length,
      withBeersStopp: results.filter((r) => r.beers_stopp > 0).length,
      failed: results.filter((r) => r.failed).length,
    },
    byProfile,
    patients: results,
  };
  writeFileSync(OUT, JSON.stringify(output, null, 2));
  process.stdout.write(
    `KLART på ${(elapsedMs / 1000).toFixed(1)}s — ${flagged.length}/${results.length} flaggade ` +
      `(${high.length} high) → ${OUT}\n`,
  );
}

main().catch((e) => { process.stderr.write(`FEL: ${e instanceof Error ? e.stack : String(e)}\n`); process.exit(1); });
