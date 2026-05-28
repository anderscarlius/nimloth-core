// SDG-09 Del 2 — fem namngivna ankarpersoner laddas till EHRbase via
// bespoke handgjorda tidslinjer (mönster: sdg02-ingrid.ts).
//
// Ingrid Andersson är Sprint 2:s huvudscenario; hennes tidslinje måste
// reproducera den kanoniska berättelsen i docs/SCENARIO.md utan att
// motsäga den (S3). De fyra trajektorie-ankarna är bespoke för att
// GARANTERAT trigga sin AQL-fråga, inte hamna i avvikelse-bucket via
// slumpmässig pathway-sampling.
//
// Patient-id-konvention: <fornamn>-<efternamn>-syn-001 (en avsedd-avvikelse
// från sdg07-scale.ts:s <profile>-<seed>-<i>-mönster — namngivna ankare
// har deterministisk identitet via NAMN, inte seed-index).

import { writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createEhr,
  postCompositionFlat,
  runAql,
} from "../ehrbase-client.js";
import {
  buildAdverseReaction,
  buildLabResult,
  buildMedicationSummary,
  buildMinimalAction,
  buildMinimalEvaluation,
  buildProblemDiagnosis,
  buildTimeSeries,
  EVENT_SHAPE_MAP,
  type CompositionContext,
  type SdgEventType,
} from "../composers/index.js";
import { EHRBASE_BASE_URL } from "../config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, "..", "..");

type Build = (ctx: CompositionContext) => Record<string, unknown>;
interface BespokeEvent {
  id: string;
  date: string; // ISO date
  eventType: SdgEventType;
  build: Build;
}

interface Anchor {
  patientId: string;
  displayName: string;
  age: number;
  profileLabel: string;
  seed: number;
  demoPoint: string;
  aqlIllustrated: string;
  composerPrefix: string;
  events: BespokeEvent[];
}

function ts(iso: string): Date {
  return new Date(`${iso}T08:00:00Z`);
}

// =========================================================================
// 1. Ingrid Andersson — Sprint 2 huvudscenario (canonical)
// =========================================================================
// pnr 19500315-2384, 74 år, Klippgatan 12, Närhälsan VC Centrum.
// T2D, HT/hyperkol, GERD, penicillinallergi. Höftprotes höger 2025-03-15.
// Postop DVT 2025-03-18 → Waran. Fall hemma → SU Östra (akut).
const INGRID_ANDERSSON: Anchor = {
  patientId: "ingrid-andersson-syn-001",
  displayName: "Ingrid Andersson",
  age: 74,
  profileLabel: "bespoke (sprint 2 scenario)",
  seed: 1503,
  demoPoint:
    "Sprint 2 huvudscenario: 74-årig kvinna, multi-morbid, fall i hemmet kräver akut allergi+antikoagulation-svar",
  aqlIllustrated: "AQL-12 (kronologisk journal) + Sprint 2 demo-script",
  composerPrefix: "SDG-09 Ingrid Andersson",
  events: [
    // 2024-11 årskontroll diabetes (baseline för senare scenario)
    {
      id: "I01",
      date: "2024-11-15",
      eventType: "primary_care_encounter",
      build: (ctx) =>
        buildMinimalAction(ctx, {
          careflowStep: "annual_diabetes_review",
          annotation:
            "primary_care_encounter | annual_diabetes_review | Närhälsan VC Centrum årskontroll",
          sdgEventType: "primary_care_encounter",
        }),
    },
    {
      id: "I02",
      date: "2024-11-15",
      eventType: "vital_signs",
      build: (ctx) =>
        buildTimeSeries(ctx, {
          magnitude: 142,
          realUnit: "mm[Hg]",
          annotation:
            "vital_signs | BP | systolic 142 mm[Hg], diastolic 88, puls 74, vikt 76 kg",
          sdgEventType: "vital_signs",
        }),
    },
    {
      id: "I03",
      date: "2024-11-15",
      eventType: "lab_result",
      build: (ctx) =>
        buildLabResult(ctx, {
          magnitude: 54,
          realUnit: "mmol/mol",
          annotation: "lab_result | HBA1C | 54 mmol/mol (välbehandlad T2D)",
          sdgEventType: "lab_result",
        }),
    },
    // Aktiva läkemedel
    {
      id: "I04",
      date: "2024-11-15",
      eventType: "medication_statement",
      build: (ctx) =>
        buildMedicationSummary(ctx, {
          magnitude: 1000,
          realUnit: "mg/d",
          annotation:
            "medication_statement | A10BA02 | Metformin 500 mg x 2 (T2D, sedan 2018)",
          sdgEventType: "medication_statement",
        }),
    },
    {
      id: "I05",
      date: "2024-11-15",
      eventType: "medication_statement",
      build: (ctx) =>
        buildMedicationSummary(ctx, {
          magnitude: 20,
          realUnit: "mg/d",
          annotation:
            "medication_statement | C10AA01 | Simvastatin 20 mg x 1 (HT/hyperkol)",
          sdgEventType: "medication_statement",
        }),
    },
    {
      id: "I06",
      date: "2024-11-15",
      eventType: "medication_statement",
      build: (ctx) =>
        buildMedicationSummary(ctx, {
          magnitude: 20,
          realUnit: "mg/d",
          annotation:
            "medication_statement | A02BC01 | Omeprazol 20 mg x 1 (refluxsjukdom)",
          sdgEventType: "medication_statement",
        }),
    },
    // 2025-02-20 koxartros + remiss
    {
      id: "I07",
      date: "2025-02-20",
      eventType: "problem_diagnosis",
      build: (ctx) =>
        buildProblemDiagnosis(ctx, {
          magnitude: 1,
          unit: "mg",
          realUnit: "1",
          annotation:
            "problem_diagnosis | M16.1 | Primär koxartros höger, röntgen grad 3",
          sdgEventType: "problem_diagnosis",
        }),
    },
    {
      id: "I08",
      date: "2025-02-20",
      eventType: "referral",
      build: (ctx) =>
        buildMinimalAction(ctx, {
          careflowStep: "referral_ortoped",
          annotation:
            "referral | ortoped | Remiss SU Mölndal ortopedmottagning, höftprotes-utredning",
          sdgEventType: "referral",
        }),
    },
    // 2025-03-15 Höftprotes
    {
      id: "I09",
      date: "2025-03-15",
      eventType: "specialist_consultation",
      build: (ctx) =>
        buildMinimalAction(ctx, {
          careflowStep: "hip_replacement",
          annotation:
            "specialist_consultation | KVÅ NFB49 | Total höftprotes höger, Zimmer Avenir Complete (stem 3, cup 52), 95 min spinal, SU Mölndal",
          sdgEventType: "specialist_consultation",
        }),
    },
    // 2025-03-18 DVT + Waran
    {
      id: "I10",
      date: "2025-03-18",
      eventType: "problem_diagnosis",
      build: (ctx) =>
        buildProblemDiagnosis(ctx, {
          magnitude: 1,
          unit: "mg",
          realUnit: "1",
          annotation:
            "problem_diagnosis | I82.4 | Postoperativ djup ventrombos, v. femoralis (UL)",
          sdgEventType: "problem_diagnosis",
        }),
    },
    {
      id: "I11",
      date: "2025-03-18",
      eventType: "medication_statement",
      build: (ctx) =>
        buildMedicationSummary(ctx, {
          magnitude: 25,
          realUnit: "mg/d (2.5 mg x 1)",
          annotation:
            "medication_statement | B01AA03 | Warfarin (Waran) 2.5 mg x 1, antikoagulation",
          sdgEventType: "medication_statement",
        }),
    },
    // 2025-03-20 INR
    {
      id: "I12",
      date: "2025-03-20",
      eventType: "lab_result",
      build: (ctx) =>
        buildLabResult(ctx, {
          magnitude: 28,
          realUnit: "INR ×10",
          annotation: "lab_result | INR | INR 2.8 (mål 2.0-3.0)",
          sdgEventType: "lab_result",
        }),
    },
    // 2025-03-25 Utskrivning + care plan
    {
      id: "I13",
      date: "2025-03-25",
      eventType: "care_plan",
      build: (ctx) =>
        buildMinimalEvaluation(ctx, {
          magnitude: 35,
          realUnit: "dagar Waran post-op",
          annotation:
            "care_plan | dvt_post_op | Waran fortsätter minst 35 d post-op, INR-kontroller 2-3 v",
          sdgEventType: "care_plan",
        }),
    },
    // 2025-05-05 Uppföljning
    {
      id: "I14",
      date: "2025-05-05",
      eventType: "specialist_consultation",
      build: (ctx) =>
        buildMinimalAction(ctx, {
          careflowStep: "ortoped_followup",
          annotation:
            "specialist_consultation | ortoped_followup | Protes i läge, gångförmåga 200 m",
          sdgEventType: "specialist_consultation",
        }),
    },
    // 2025-10-15 Årskontroll
    {
      id: "I15",
      date: "2025-10-15",
      eventType: "primary_care_encounter",
      build: (ctx) =>
        buildMinimalAction(ctx, {
          careflowStep: "annual_review",
          annotation:
            "primary_care_encounter | annual_review | Närhälsan årskontroll diabetes + antikoagulation",
          sdgEventType: "primary_care_encounter",
        }),
    },
    {
      id: "I16",
      date: "2025-10-15",
      eventType: "lab_result",
      build: (ctx) =>
        buildLabResult(ctx, {
          magnitude: 52,
          realUnit: "mmol/mol",
          annotation: "lab_result | HBA1C | 52 mmol/mol (stabil T2D)",
          sdgEventType: "lab_result",
        }),
    },
    // === Fas 3 AC2 — penicillinallergi (strukturerad) + aktiv amoxicillin ===
    // Allergin fanns tidigare bara i narrativ (kommentar + demoPoint). Författas
    // nu som äkta adverse_reaction_risk.v2-composition SÅ ATT medicinerings-
    // genomgången kan LÄSA den. Den aktiva amoxicillinen (J01CA04) skapar
    // konflikten "aktiv penicillin-besläktad medicin + dokumenterad
    // penicillinallergi" som genomgången hittar i sitt vanliga flöde — ett
    // kliniskt farligt fel en review SKA fånga. Allergin blir konsumerad, ej
    // bara visad.
    {
      id: "I17",
      date: "2024-11-15", // dokumenterad sedan länge i journalen
      eventType: "adverse_reaction",
      build: (ctx) =>
        buildAdverseReaction(ctx, {
          substanceName: "Penicillin",
          substanceCode: "J01CE", // ATC: betalaktamaskänsliga penicilliner
          criticality: "high",
          manifestation: "anafylaxi",
          reactionType: "allergy",
          annotation:
            "adverse_reaction | J01CE | Penicillinallergi, anafylaktisk reaktion (dokumenterad)",
          sdgEventType: "adverse_reaction",
        }),
    },
    {
      id: "I18",
      date: "2025-11-20", // nyligen insatt — den farliga förskrivningen
      eventType: "medication_statement",
      build: (ctx) =>
        buildMedicationSummary(ctx, {
          magnitude: 1500,
          realUnit: "mg/d (500 mg x 3)",
          annotation:
            "medication_statement | J01CA04 | Amoxicillin 500 mg x 3 (UVI, nyinsatt)",
          sdgEventType: "medication_statement",
        }),
    },
  ],
};

// =========================================================================
// Helper: build bespoke event-array för trajektorie-ankarna
// =========================================================================
function ev(id: string, date: string, eventType: SdgEventType, build: Build): BespokeEvent {
  return { id, date, eventType, build };
}

// =========================================================================
// 2. Anders Bergström — AQL-06-ankare (utebliven uppföljning)
// =========================================================================
// 58 år, diabetes typ 2 diagnostiseras 2025-01-15, metformin sätts in,
// men patienten tappas bort - INGEN uppföljande HbA1c registreras.
// Predikat: problem_diagnosis*diabetes_typ2 OCH ingen *HBA1C* efter diagdatum.
const ANDERS_BERGSTROM: Anchor = {
  patientId: "anders-bergstrom-syn-001",
  displayName: "Anders Bergström",
  age: 58,
  profileLabel: "bespoke (AQL-06 dropout)",
  seed: 1958,
  demoPoint:
    "58-årig man, diabetes typ 2 diagnostiserad, metformin insatt — försvinner från uppföljning. Klassisk lost-to-followup-fall.",
  aqlIllustrated: "AQL-06 (diabetespatienter utan uppföljande HbA1c inom 90 d)",
  composerPrefix: "SDG-09 Anders Bergström",
  events: [
    ev("A01", "2025-01-15", "primary_care_encounter", (ctx) =>
      buildMinimalAction(ctx, {
        careflowStep: "first_diabetes_visit",
        annotation:
          "primary_care_encounter | first_diabetes_visit | Trötthet, törst, viktnedgång — diabetes-utredning",
        sdgEventType: "primary_care_encounter",
      }),
    ),
    ev("A02", "2025-01-15", "lab_order", (ctx) =>
      buildMinimalAction(ctx, {
        careflowStep: "lab_ordered",
        annotation: "lab_order | hba1c,glukos,kreatinin | Diabetes-screening",
        sdgEventType: "lab_order",
      }),
    ),
    ev("A03", "2025-01-17", "lab_result", (ctx) =>
      buildLabResult(ctx, {
        magnitude: 78,
        realUnit: "mmol/mol",
        annotation: "lab_result | HBA1C | 78 mmol/mol (manifest T2D)",
        sdgEventType: "lab_result",
      }),
    ),
    ev("A04", "2025-01-20", "problem_diagnosis", (ctx) =>
      buildProblemDiagnosis(ctx, {
        magnitude: 1,
        unit: "mg",
        realUnit: "1",
        annotation:
          "problem_diagnosis | E11 | Diabetes mellitus typ 2, severity=moderate, HbA1c 78",
        sdgEventType: "problem_diagnosis",
      }),
    ),
    ev("A05", "2025-01-20", "medication_statement", (ctx) =>
      buildMedicationSummary(ctx, {
        magnitude: 1000,
        realUnit: "mg/d",
        annotation:
          "medication_statement | A10BA02 | Metformin 500 mg x 2 (insatt)",
        sdgEventType: "medication_statement",
      }),
    ),
    // INGEN followup-lab. INGEN återbesök. Patienten dropoutar.
  ],
};

// =========================================================================
// 3. Karin Eriksson — AQL-09-ankare (frekvent återbesökare)
// =========================================================================
// 72 år, recidiverande UVI. 5 vårdcentralsbesök inom ~70 dygn.
const KARIN_ERIKSSON: Anchor = {
  patientId: "karin-eriksson-syn-001",
  displayName: "Karin Eriksson",
  age: 72,
  profileLabel: "bespoke (AQL-09 recurrent UVI)",
  seed: 1972,
  demoPoint:
    "72-årig kvinna med recidiverande urinvägsinfektion — 5 vårdcentralsbesök på 70 dygn, antibiotika-resistensutredning aktuell.",
  aqlIllustrated:
    "AQL-09 (> 3 primary_care_encounter inom rullande 90-dygnsfönster)",
  composerPrefix: "SDG-09 Karin Eriksson",
  events: [
    ev("K01", "2025-04-02", "primary_care_encounter", (ctx) =>
      buildMinimalAction(ctx, {
        careflowStep: "uvi_visit_1",
        annotation:
          "primary_care_encounter | uvi_visit_1 | Dysuri, frekventa miktioner — UVI misstänkt",
        sdgEventType: "primary_care_encounter",
      }),
    ),
    ev("K02", "2025-04-02", "medication_statement", (ctx) =>
      buildMedicationSummary(ctx, {
        magnitude: 150,
        realUnit: "mg/d",
        annotation:
          "medication_statement | J01XE01 | Nitrofurantoin 50 mg x 3 (5 dagar)",
        sdgEventType: "medication_statement",
      }),
    ),
    ev("K03", "2025-04-23", "primary_care_encounter", (ctx) =>
      buildMinimalAction(ctx, {
        careflowStep: "uvi_recurrence_1",
        annotation:
          "primary_care_encounter | uvi_recurrence_1 | Återbesök, kvarstående symtom — odling beställd",
        sdgEventType: "primary_care_encounter",
      }),
    ),
    ev("K04", "2025-05-08", "primary_care_encounter", (ctx) =>
      buildMinimalAction(ctx, {
        careflowStep: "uvi_recurrence_2",
        annotation:
          "primary_care_encounter | uvi_recurrence_2 | Tredje besök på 5 v, ESBL-misstanke",
        sdgEventType: "primary_care_encounter",
      }),
    ),
    ev("K05", "2025-05-08", "medication_statement", (ctx) =>
      buildMedicationSummary(ctx, {
        magnitude: 600,
        realUnit: "mg/d",
        annotation:
          "medication_statement | J01CA08 | Pivmecillinam 200 mg x 3 (escalation)",
        sdgEventType: "medication_statement",
      }),
    ),
    ev("K06", "2025-05-25", "primary_care_encounter", (ctx) =>
      buildMinimalAction(ctx, {
        careflowStep: "uvi_recurrence_3",
        annotation:
          "primary_care_encounter | uvi_recurrence_3 | Fjärde besök, resistensprofil pågår",
        sdgEventType: "primary_care_encounter",
      }),
    ),
    ev("K07", "2025-06-08", "primary_care_encounter", (ctx) =>
      buildMinimalAction(ctx, {
        careflowStep: "uvi_recurrence_4",
        annotation:
          "primary_care_encounter | uvi_recurrence_4 | Femte besök, remiss urolog aktuell",
        sdgEventType: "primary_care_encounter",
      }),
    ),
  ],
};

// =========================================================================
// 4. Lars Johansson — AQL-10-ankare (responder)
// =========================================================================
// 64 år, diabetes typ 2, svarar utmärkt på metformin: HbA1c 82 → 58.
const LARS_JOHANSSON: Anchor = {
  patientId: "lars-johansson-syn-001",
  displayName: "Lars Johansson",
  age: 64,
  profileLabel: "bespoke (AQL-10 responder)",
  seed: 1964,
  demoPoint:
    "64-årig man, nydiagnostiserad diabetes typ 2 (HbA1c 82). Metformin insatt + livsstilsförändring → HbA1c 58 efter 4 mån. Klassisk responder.",
  aqlIllustrated:
    "AQL-10 (förbättrade labbvärden efter läkemedelsinsättning)",
  composerPrefix: "SDG-09 Lars Johansson",
  events: [
    ev("L01", "2025-02-10", "primary_care_encounter", (ctx) =>
      buildMinimalAction(ctx, {
        careflowStep: "first_visit_diabetes",
        annotation:
          "primary_care_encounter | first_visit | Initial diabetes-utredning, BT 148/92",
        sdgEventType: "primary_care_encounter",
      }),
    ),
    ev("L02", "2025-02-13", "lab_result", (ctx) =>
      buildLabResult(ctx, {
        magnitude: 82,
        realUnit: "mmol/mol",
        annotation: "lab_result | HBA1C | 82 mmol/mol (initial, manifest T2D)",
        sdgEventType: "lab_result",
      }),
    ),
    ev("L03", "2025-02-17", "problem_diagnosis", (ctx) =>
      buildProblemDiagnosis(ctx, {
        magnitude: 1,
        unit: "mg",
        realUnit: "1",
        annotation:
          "problem_diagnosis | E11 | Diabetes mellitus typ 2, severity=severe, HbA1c 82",
        sdgEventType: "problem_diagnosis",
      }),
    ),
    ev("L04", "2025-02-17", "medication_statement", (ctx) =>
      buildMedicationSummary(ctx, {
        magnitude: 1000,
        realUnit: "mg/d",
        annotation:
          "medication_statement | A10BA02 | Metformin 500 mg x 2 (insatt)",
        sdgEventType: "medication_statement",
      }),
    ),
    ev("L05", "2025-06-20", "lab_result", (ctx) =>
      buildLabResult(ctx, {
        magnitude: 58,
        realUnit: "mmol/mol",
        annotation: "lab_result | HBA1C | 58 mmol/mol (4 mån efter rx, RESPONDER)",
        sdgEventType: "lab_result",
      }),
    ),
    ev("L06", "2025-06-20", "care_plan", (ctx) =>
      buildMinimalEvaluation(ctx, {
        magnitude: 6,
        realUnit: "mån",
        annotation:
          "care_plan | followup | Fortsatt metformin, kontroll om 6 mån",
        sdgEventType: "care_plan",
      }),
    ),
  ],
};

// =========================================================================
// 5. Eva Lindgren — AQL-14-ankare (non-responder)
// =========================================================================
// 71 år, diabetes typ 2. Metformin sätts in men HbA1c stiger (82 → 88).
// Kandidat för SGLT2-tillägg.
const EVA_LINDGREN: Anchor = {
  patientId: "eva-lindgren-syn-001",
  displayName: "Eva Lindgren",
  age: 71,
  profileLabel: "bespoke (AQL-14 non-responder)",
  seed: 1971,
  demoPoint:
    "71-årig kvinna, diabetes typ 2 (HbA1c 82). Metformin insatt men HbA1c STIGER till 88 efter 4 mån — non-responder, SGLT2-tillägg aktuellt.",
  aqlIllustrated:
    "AQL-14 (försämrade labbvärden trots läkemedelsinsättning)",
  composerPrefix: "SDG-09 Eva Lindgren",
  events: [
    ev("E01", "2025-03-05", "primary_care_encounter", (ctx) =>
      buildMinimalAction(ctx, {
        careflowStep: "first_diabetes_visit",
        annotation:
          "primary_care_encounter | first_diabetes_visit | Trötthet, polyuri — diabetes-utredning",
        sdgEventType: "primary_care_encounter",
      }),
    ),
    ev("E02", "2025-03-08", "lab_result", (ctx) =>
      buildLabResult(ctx, {
        magnitude: 82,
        realUnit: "mmol/mol",
        annotation: "lab_result | HBA1C | 82 mmol/mol (initial)",
        sdgEventType: "lab_result",
      }),
    ),
    ev("E03", "2025-03-12", "problem_diagnosis", (ctx) =>
      buildProblemDiagnosis(ctx, {
        magnitude: 1,
        unit: "mg",
        realUnit: "1",
        annotation:
          "problem_diagnosis | E11 | Diabetes mellitus typ 2, severity=severe, HbA1c 82",
        sdgEventType: "problem_diagnosis",
      }),
    ),
    ev("E04", "2025-03-12", "medication_statement", (ctx) =>
      buildMedicationSummary(ctx, {
        magnitude: 1000,
        realUnit: "mg/d",
        annotation:
          "medication_statement | A10BA02 | Metformin 500 mg x 2 (insatt)",
        sdgEventType: "medication_statement",
      }),
    ),
    ev("E05", "2025-07-15", "lab_result", (ctx) =>
      buildLabResult(ctx, {
        magnitude: 88,
        realUnit: "mmol/mol",
        annotation:
          "lab_result | HBA1C | 88 mmol/mol (4 mån efter rx, NON-RESPONDER — försämring trots metformin)",
        sdgEventType: "lab_result",
      }),
    ),
    ev("E06", "2025-07-15", "care_plan", (ctx) =>
      buildMinimalEvaluation(ctx, {
        magnitude: 1,
        unit: "mg",
        realUnit: "intensifiering",
        annotation:
          "care_plan | sglt2_addition | Non-responder — SGLT2-hämmare (empagliflozin) övervägs som tillägg",
        sdgEventType: "care_plan",
      }),
    ),
  ],
};

const ANCHORS: Anchor[] = [
  INGRID_ANDERSSON,
  ANDERS_BERGSTROM,
  KARIN_ERIKSSON,
  LARS_JOHANSSON,
  EVA_LINDGREN,
];

// =========================================================================
// Loader
// =========================================================================

interface LoadResult {
  anchor: Anchor;
  ehrId: string;
  compositionUids: string[];
  errors: string[];
}

async function loadAnchor(a: Anchor): Promise<LoadResult> {
  console.log(`\n=== ${a.displayName} (${a.patientId}) ===`);
  const ehrId = await createEhr(a.patientId);
  console.log(`  ehr_id: ${ehrId}`);

  const compositionUids: string[] = [];
  const errors: string[] = [];

  for (const e of a.events) {
    const ctx: CompositionContext = {
      language: "sv",
      territory: "SE",
      composerName: a.composerPrefix,
      time: ts(e.date),
    };
    const flat = e.build(ctx);
    const templateId = EVENT_SHAPE_MAP[e.eventType];
    try {
      const uid = await postCompositionFlat(ehrId, templateId, flat);
      compositionUids.push(uid);
      console.log(`  ✓ ${e.id} ${e.date} ${e.eventType.padEnd(28)} ${uid}`);
    } catch (err) {
      const msg = String(err);
      errors.push(`${e.id}: ${msg}`);
      console.error(`  ✗ ${e.id} ${e.date} ${e.eventType.padEnd(28)} ${msg}`);
    }
  }
  return { anchor: a, ehrId, compositionUids, errors };
}

// =========================================================================
// Reachability-verifiering: säkerställ att AQL-fångsten fungerar
// =========================================================================
async function verifyReachability(results: LoadResult[]): Promise<Record<string, boolean>> {
  const out: Record<string, boolean> = {};

  // Hjälpfunktion — kör AQL och plocka ehr_id-set
  async function ehrSet(aql: string): Promise<Set<string>> {
    const r = await runAql<unknown[][]>(aql);
    return new Set((r.rows ?? []).map((row) => String((row as unknown[])[0])));
  }

  // AQL-06: dropout-diabetes (utan uppföljande HBA1C inom 90d efter diagnos)
  // Vi använder demo-runnerens postProcess-logik förenklat: hämta alla
  // diabetes_typ2+HBA1C-rader och processera på samma sätt som AQL-06.
  const rows06 = await runAql<unknown[][]>(
    "SELECT e/ehr_id/value, c/composer/name, c/context/start_time/value FROM EHR e CONTAINS COMPOSITION c WHERE c/composer/name LIKE '*E11*' OR c/composer/name LIKE '*HBA1C*' ORDER BY e/ehr_id/value, c/context/start_time/value",
  );
  const aql06Hits = new Set<string>();
  const byPatient = new Map<string, { diagDate?: string; lastHba1c?: string }>();
  for (const r of rows06.rows ?? []) {
    const ehr = String((r as unknown[])[0]);
    const name = String((r as unknown[])[1]);
    const t = String((r as unknown[])[2]);
    const entry = byPatient.get(ehr) ?? {};
    // Fas 3: diabetes-diagnos kodas nu E11 (normaliserad, ej profil-tagg).
    if (name.includes("problem_diagnosis") && name.includes("E11") && !entry.diagDate) {
      entry.diagDate = t;
    }
    if (name.includes("HBA1C") && entry.diagDate && t > entry.diagDate) {
      entry.lastHba1c = t;
    }
    byPatient.set(ehr, entry);
  }
  for (const [ehr, e] of byPatient.entries()) {
    if (!e.diagDate) continue;
    if (!e.lastHba1c) {
      aql06Hits.add(ehr);
      continue;
    }
    const days =
      (new Date(e.lastHba1c).getTime() - new Date(e.diagDate).getTime()) /
      86_400_000;
    if (days > 90) aql06Hits.add(ehr);
  }

  out["AQL-06 (Anders dropout)"] = aql06Hits.has(
    results.find((r) => r.anchor.patientId === "anders-bergstrom-syn-001")?.ehrId ?? "",
  );

  // AQL-09: ≥4 primary_care_encounter inom rullande 90-dygnsfönster
  const rows09 = await runAql<unknown[][]>(
    "SELECT e/ehr_id/value, c/context/start_time/value FROM EHR e CONTAINS COMPOSITION c WHERE c/composer/name LIKE '*primary_care_encounter*' ORDER BY e/ehr_id/value, c/context/start_time/value",
  );
  const datesByEhr = new Map<string, string[]>();
  for (const r of rows09.rows ?? []) {
    const ehr = String((r as unknown[])[0]);
    const t = String((r as unknown[])[1]);
    const arr = datesByEhr.get(ehr) ?? [];
    arr.push(t);
    datesByEhr.set(ehr, arr);
  }
  const aql09Hits = new Set<string>();
  for (const [ehr, dates] of datesByEhr.entries()) {
    if (dates.length < 4) continue;
    for (let i = 0; i <= dates.length - 4; i++) {
      const span = new Date(dates[i + 3]).getTime() - new Date(dates[i]).getTime();
      if (span / 86_400_000 <= 90) {
        aql09Hits.add(ehr);
        break;
      }
    }
  }
  out["AQL-09 (Karin recurrence)"] = aql09Hits.has(
    results.find((r) => r.anchor.patientId === "karin-eriksson-syn-001")?.ehrId ?? "",
  );

  // AQL-10/14: HbA1c-trend efter medication_statement
  const rows10 = await runAql<unknown[][]>(
    "SELECT e/ehr_id/value, c/composer/name, c/context/start_time/value FROM EHR e CONTAINS COMPOSITION c WHERE c/composer/name LIKE '*HBA1C*' OR c/composer/name LIKE '*medication_statement*' ORDER BY e/ehr_id/value, c/context/start_time/value",
  );
  type Trend = {
    firstLab?: { date: string; val: number };
    rxAfter?: string;
    lastLab?: { date: string; val: number };
  };
  const trendByEhr = new Map<string, Trend>();
  for (const r of rows10.rows ?? []) {
    const ehr = String((r as unknown[])[0]);
    const name = String((r as unknown[])[1]);
    const date = String((r as unknown[])[2]);
    const entry = trendByEhr.get(ehr) ?? {};
    if (name.includes("HBA1C")) {
      const m = name.match(/(\d+(?:\.\d+)?)\s*mmol\/mol/);
      if (m) {
        const val = Number(m[1]);
        if (!entry.firstLab) entry.firstLab = { date, val };
        entry.lastLab = { date, val };
      }
    } else if (
      name.includes("medication_statement") &&
      entry.firstLab &&
      !entry.rxAfter &&
      date >= entry.firstLab.date
    ) {
      entry.rxAfter = date;
    }
    trendByEhr.set(ehr, entry);
  }
  const aql10Hits = new Set<string>();
  const aql14Hits = new Set<string>();
  for (const [ehr, e] of trendByEhr.entries()) {
    if (!e.firstLab || !e.lastLab || !e.rxAfter) continue;
    if (e.lastLab.val < e.firstLab.val) aql10Hits.add(ehr);
    else if (e.lastLab.val > e.firstLab.val) aql14Hits.add(ehr);
  }
  out["AQL-10 (Lars responder)"] = aql10Hits.has(
    results.find((r) => r.anchor.patientId === "lars-johansson-syn-001")?.ehrId ?? "",
  );
  out["AQL-14 (Eva non-responder)"] = aql14Hits.has(
    results.find((r) => r.anchor.patientId === "eva-lindgren-syn-001")?.ehrId ?? "",
  );

  // AQL-12 (Ingrid kronologi)
  const rowsIngrid = await runAql<unknown[][]>(
    `SELECT c/uid/value FROM EHR e CONTAINS COMPOSITION c WHERE e/ehr_status/subject/external_ref/id/value = 'ingrid-andersson-syn-001'`,
  );
  out["AQL-12 (Ingrid journal)"] = (rowsIngrid.rows ?? []).length >= 10;

  return out;
}

// =========================================================================
// Main
// =========================================================================
async function main(): Promise<void> {
  console.log(`SDG-09 Del 2 — laddar 5 ankarpersoner → ${EHRBASE_BASE_URL}`);

  const results: LoadResult[] = [];
  for (const a of ANCHORS) {
    results.push(await loadAnchor(a));
  }

  console.log("\n=== Reachability-verifiering ===");
  const reach = await verifyReachability(results);
  for (const [k, v] of Object.entries(reach)) {
    console.log(`  ${v ? "✓" : "✗"} ${k}`);
  }

  // Skriv resultatfil
  const outPath = join(PKG_ROOT, "data", "sdg09_anchors_result.json");
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        loadedAt: new Date().toISOString(),
        ehrbase: EHRBASE_BASE_URL,
        anchors: results.map((r) => ({
          patientId: r.anchor.patientId,
          displayName: r.anchor.displayName,
          age: r.anchor.age,
          profileLabel: r.anchor.profileLabel,
          seed: r.anchor.seed,
          demoPoint: r.anchor.demoPoint,
          aqlIllustrated: r.anchor.aqlIllustrated,
          ehrId: r.ehrId,
          compositionCount: r.compositionUids.length,
          errorCount: r.errors.length,
        })),
        reachability: reach,
      },
      null,
      2,
    ),
  );
  console.log(`\nResultat: ${outPath}`);
  if (results.some((r) => r.errors.length > 0)) process.exit(2);
  if (Object.values(reach).some((v) => !v)) process.exit(3);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
