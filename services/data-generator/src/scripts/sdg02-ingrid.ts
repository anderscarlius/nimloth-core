// SDG-02 — Ingrid Svensson round-trip proof.
// Posts 10 compositions across 3 fixture shapes against EHRbase
// and verifies via AQL.
import { writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createEhr,
  postCompositionFlat,
  runAql,
  EhrbaseError,
} from "../ehrbase-client.js";
import {
  buildTimeSeries,
  buildMinimalAction,
  buildMinimalEvaluation,
  EVENT_SHAPE_MAP,
  type CompositionContext,
  type SdgEventType,
} from "../composers/index.js";
import { EHRBASE_BASE_URL } from "../config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, "..", "..");

const PATIENT_ID = "ingrid-svensson-syn-001";
const COMPOSER = "Nimloth SDG Fas 0";
const DAY0 = new Date("2026-01-08T08:30:00Z");

function plusDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

type Event = {
  id: string;
  day: number;
  eventType: SdgEventType;
  build: (ctx: CompositionContext) => Record<string, unknown>;
};

const EVENTS: Event[] = [
  {
    id: "C01",
    day: 0,
    eventType: "primary_care_encounter",
    build: (ctx) =>
      buildMinimalAction(ctx, {
        careflowStep: "first_contact_vc",
        currentState: "completed",
        annotation:
          "primary_care_encounter | first_visit | Trötthet, törst, dimsyn. BT 158/92, BMI 31.",
        sdgEventType: "primary_care_encounter",
      }),
  },
  {
    id: "C02",
    day: 0,
    eventType: "vital_signs",
    build: (ctx) =>
      buildTimeSeries(ctx, {
        magnitude: 158, // systoliskt BT som representativt mätvärde
        realUnit: "mm[Hg]",
        annotation: "vital_signs | BP | BT 158/92, puls 84, vikt 87 kg, temp 36.8",
        sdgEventType: "vital_signs",
      }),
  },
  {
    id: "C03",
    day: 0,
    eventType: "lab_order",
    build: (ctx) =>
      buildMinimalAction(ctx, {
        careflowStep: "lab_ordered",
        currentState: "active",
        annotation:
          "lab_order | hba1c,glukos,kreatinin,lipider | Beställda prover dag 0",
        sdgEventType: "lab_order",
      }),
  },
  {
    id: "C04",
    day: 1,
    eventType: "lab_result",
    build: (ctx) =>
      buildTimeSeries(ctx, {
        magnitude: 82,
        realUnit: "mmol/mol",
        annotation: "lab_result | HBA1C | HbA1c 82 mmol/mol (förhöjt)",
        sdgEventType: "lab_result",
      }),
  },
  {
    id: "C05",
    day: 3,
    eventType: "problem_diagnosis",
    build: (ctx) =>
      buildMinimalEvaluation(ctx, {
        magnitude: 1,
        unit: "mg",
        realUnit: "1",
        annotation: "problem_diagnosis | E11 | Diabetes mellitus typ 2",
        sdgEventType: "problem_diagnosis",
      }),
  },
  {
    id: "C06",
    day: 3,
    eventType: "medication_statement",
    build: (ctx) =>
      buildMinimalEvaluation(ctx, {
        magnitude: 1000,
        unit: "mg",
        realUnit: "mg/d",
        annotation:
          "medication_statement | A10BA02 | Metformin 500 mg x 2 insatt",
        sdgEventType: "medication_statement",
      }),
  },
  {
    id: "C07",
    day: 3,
    eventType: "referral",
    build: (ctx) =>
      buildMinimalAction(ctx, {
        careflowStep: "referral_endo",
        currentState: "active",
        annotation:
          "referral | endocrinology | Remiss endokrinolog pga HbA1c > 80",
        sdgEventType: "referral",
      }),
  },
  {
    id: "C08",
    day: 48,
    eventType: "specialist_consultation",
    build: (ctx) =>
      buildMinimalAction(ctx, {
        careflowStep: "specialist_seen",
        currentState: "completed",
        annotation:
          "specialist_consultation | endocrinology | Justerad behandling, SGLT2 övervägs",
        sdgEventType: "specialist_consultation",
      }),
  },
  {
    id: "C09",
    day: 95,
    eventType: "lab_result",
    build: (ctx) =>
      buildTimeSeries(ctx, {
        magnitude: 68,
        realUnit: "mmol/mol",
        annotation: "lab_result | HBA1C | HbA1c 68 mmol/mol (förbättring)",
        sdgEventType: "lab_result",
      }),
  },
  {
    id: "C10",
    day: 95,
    eventType: "care_plan",
    build: (ctx) =>
      buildMinimalEvaluation(ctx, {
        magnitude: 3,
        unit: "mg",
        realUnit: "mo",
        annotation:
          "care_plan | followup | Fortsatt metformin, livsstil, kontroll om 3 månader",
        sdgEventType: "care_plan",
      }),
  },
];

type StepResult = {
  id: string;
  day: number;
  eventType: SdgEventType;
  templateId: string;
  status: "OK" | "FAIL";
  compositionUid?: string;
  error?: string;
  bodySnippet?: string;
};

async function main() {
  console.log(`SDG-02: Ingrid Svensson round-trip → ${EHRBASE_BASE_URL}`);

  let ehrId: string;
  try {
    ehrId = await createEhr(PATIENT_ID);
  } catch (err) {
    console.error("EHR creation failed:", err);
    process.exit(1);
  }
  console.log(`  ehr_id = ${ehrId}`);

  const results: StepResult[] = [];
  for (const evt of EVENTS) {
    const ctx: CompositionContext = {
      language: "sv",
      territory: "SE",
      composerName: COMPOSER,
      time: plusDays(DAY0, evt.day),
    };
    const flat = evt.build(ctx);
    const templateId = EVENT_SHAPE_MAP[evt.eventType];
    try {
      const uid = await postCompositionFlat(ehrId, templateId, flat);
      results.push({
        id: evt.id,
        day: evt.day,
        eventType: evt.eventType,
        templateId,
        status: "OK",
        compositionUid: uid,
      });
      console.log(`  ✓ ${evt.id} (${evt.eventType} → ${templateId})  ${uid}`);
    } catch (err) {
      const ehbErr = err instanceof EhrbaseError ? err : null;
      results.push({
        id: evt.id,
        day: evt.day,
        eventType: evt.eventType,
        templateId,
        status: "FAIL",
        error: ehbErr ? `HTTP ${ehbErr.status}` : String(err),
        bodySnippet: ehbErr?.body?.slice(0, 300),
      });
      console.error(
        `  ✗ ${evt.id} (${evt.eventType} → ${templateId})  ${ehbErr ? `HTTP ${ehbErr.status}` : err}`,
      );
      if (ehbErr) console.error(`    ${ehbErr.body.slice(0, 300)}`);
    }
  }

  console.log("\nAQL verifiering:");
  const aqls = {
    countAll: `SELECT COUNT(c) FROM EHR e CONTAINS COMPOSITION c WHERE e/ehr_id/value = '${ehrId}'`,
    compositions: `SELECT c/uid/value, c/composer/name, c/context/start_time/value FROM EHR e CONTAINS COMPOSITION c WHERE e/ehr_id/value = '${ehrId}' ORDER BY c/context/start_time/value`,
    hba1cs: `SELECT c/composer/name, c/context/start_time/value FROM EHR e CONTAINS COMPOSITION c WHERE e/ehr_id/value = '${ehrId}' AND c/composer/name LIKE '*HbA1c*' ORDER BY c/context/start_time/value`,
    diagnoses: `SELECT c/composer/name FROM EHR e CONTAINS COMPOSITION c WHERE e/ehr_id/value = '${ehrId}' AND c/composer/name LIKE '*problem_diagnosis*'`,
  };

  const aqlResults: Record<string, unknown> = {};
  for (const [name, q] of Object.entries(aqls)) {
    try {
      const r = await runAql(q);
      aqlResults[name] = r;
      console.log(`  [${name}] rows=${(r.rows ?? []).length}`);
    } catch (err) {
      aqlResults[name] = { error: String(err) };
      console.error(`  [${name}] FAIL ${err}`);
    }
  }

  // Write report
  const okCount = results.filter((r) => r.status === "OK").length;
  let md = `# SDG-02 — Ingrid Svensson round-trip-rapport\n\n`;
  md += `Genererad: ${new Date().toISOString()}\n`;
  md += `EHRbase: ${EHRBASE_BASE_URL}\n`;
  md += `Patient subject_id: \`${PATIENT_ID}\`\n`;
  md += `ehr_id: \`${ehrId}\`\n\n`;
  md += `## Resultat\n\n`;
  md += `${okCount}/${results.length} compositions postade utan fel.\n\n`;
  md += `| ID | Dag | Event-typ | Template | Status | composition_uid |\n`;
  md += `|---|---:|---|---|---|---|\n`;
  for (const r of results) {
    md += `| ${r.id} | ${r.day} | ${r.eventType} | ${r.templateId} | ${r.status} | ${r.compositionUid ? `\`${r.compositionUid}\`` : (r.error ?? "—")} |\n`;
  }
  md += `\n## AQL-verifiering\n\n`;
  md += "```sql\n";
  md += Object.entries(aqls)
    .map(([k, v]) => `-- ${k}\n${v};`)
    .join("\n\n");
  md += "\n```\n\n";
  md += "### Resultat (rader)\n\n";
  for (const [name, res] of Object.entries(aqlResults)) {
    const rows = (res as { rows?: unknown[] }).rows ?? [];
    md += `- **${name}**: ${rows.length} rader\n`;
  }
  md += `\n## Anteckning om scope\n\n`;
  md += `Compositions skrivs mot tre fixture-shapes (time_series, minimal_action, minimal_evaluation) eftersom\n`;
  md += `domänspecifika OPT:er ännu inte finns (P3.0b ADL→OPT-compiler är öppet arbete). Kliniska detaljer\n`;
  md += `(diagnoskoder, läkemedelsnamn) bärs i \`composer.name\` enligt mönstret\n`;
  md += `\`"TYPE | CODE | DESCRIPTION"\` så AQL CONTAINS-frågor kan filtrera per event-typ och kod.\n`;

  const outPath = join(PKG_ROOT, "fas0", "ingrid_svensson_report.md");
  writeFileSync(outPath, md, "utf-8");
  writeFileSync(
    join(PKG_ROOT, "fas0", "ingrid_svensson_result.json"),
    JSON.stringify({ ehrId, results, aqlResults }, null, 2),
    "utf-8",
  );
  console.log(`\nRapport: ${outPath}`);

  if (okCount !== results.length) {
    process.exit(2);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
