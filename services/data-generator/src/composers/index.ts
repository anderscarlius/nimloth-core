// Three shape-composers (time_series, minimal_action, minimal_evaluation)
// + an event router that maps SDG's 10 logical event types to one of the shapes.
//
// Paths follow EHRbase's FLAT format as advertised by /example endpoint:
//   - Composition-root attributes are direct: prefix/start_time, prefix/setting|code, ...
//   - Archetype content nodes use :0 index: prefix/time_series:0/..., prefix/minimal:0/...
//
// Convention for embedding clinical semantics in the lean fixture shapes:
//   - composer.name carries "TYPE | CODE | DESCRIPTION" so AQL CONTAINS-queries can
//     filter on event type and clinical code.
//   - category|code holds the coarse SDG event type id.
//   - For time_series: quantity|magnitude + quantity|unit hold the measurement.
//   - For minimal_action: careflow_step|code holds an action verb.
//   - For minimal_evaluation: quantity|magnitude carries a numeric flag or score.
//   - start_time at composition root holds the event date.

export type FlatJson = Record<string, unknown>;

export interface CompositionContext {
  language: string;
  territory: string;
  composerName: string;
  time: Date;
}

function rootCtx(prefix: string, ctx: CompositionContext): FlatJson {
  // EHRbase 2.x FLAT input does NOT accept root /setting, /start_time, /_end_time
  // or /_health_care_facility — these are auto-populated server-side.
  // SDG-09 fix (Path B): composition-level context.start_time IS settable via
  // the ctx/-prefix in FLAT input. Empirically verified: ctx/time → lands in
  // c/context/start_time/value via AQL. Without this, all events for one patient
  // share the EHRbase receive-time and temporal AQL queries (AQL-06/09/10/14)
  // collapse to ~0 dygn-skillnad. With this, ctx.time (= DAY0 + pathway day_offset)
  // is honoured per composition.
  return {
    [`${prefix}/language|code`]: ctx.language,
    [`${prefix}/language|terminology`]: "ISO_639-1",
    [`${prefix}/territory|code`]: ctx.territory,
    [`${prefix}/territory|terminology`]: "ISO_3166-1",
    [`${prefix}/composer|name`]: ctx.composerName,
    "ctx/time": ctx.time.toISOString(),
  };
}

function archetypeLang(prefix: string): FlatJson {
  return {
    [`${prefix}/language|code`]: "sv",
    [`${prefix}/language|terminology`]: "ISO_639-1",
    [`${prefix}/encoding|code`]: "UTF-8",
    [`${prefix}/encoding|terminology`]: "IANA_character-sets",
  };
}

// --- Shape 1: time_series.en.v1 (DV_QUANTITY observation) ---
//
// FIXTURE CONSTRAINT: quantity|unit must be exactly "mm3". Real unit metadata
// is carried only in the annotation (composer.name).
const TIME_SERIES_UNIT = "mm3";

export interface TimeSeriesData {
  magnitude: number;
  /** Real unit (e.g. "mmol/mol", "mm[Hg]"). Stored in annotation only — the OPT
   *  hardcodes the canonical unit to "mm3" so we cannot persist it structurally. */
  realUnit: string;
  eventTime?: Date;
  /** Free-text annotation embedded in composer.name (TYPE | CODE | DESC). */
  annotation: string;
  /** Coarse SDG event type — encoded in annotation; carried here for tooling. */
  sdgEventType: string;
}

export function buildTimeSeries(
  ctx: CompositionContext,
  data: TimeSeriesData,
): FlatJson {
  const prefix = "event_series";
  const obsPrefix = `${prefix}/time_series:0`;
  const eventTime = (data.eventTime ?? ctx.time).toISOString();
  const annotation = `${data.annotation} [unit=${data.realUnit}]`;
  return {
    ...rootCtx(prefix, { ...ctx, composerName: annotation }),
    [`${prefix}/category|code`]: "433",
    [`${prefix}/category|value`]: "event",
    [`${prefix}/category|terminology`]: "openehr",
    ...archetypeLang(obsPrefix),
    [`${obsPrefix}/any_event:0/time`]: eventTime,
    [`${obsPrefix}/any_event:0/quantity|magnitude`]: data.magnitude,
    [`${obsPrefix}/any_event:0/quantity|unit`]: TIME_SERIES_UNIT,
  };
}

// --- Shape 2: minimal_action.en.v1 (ACTION + ISM_TRANSITION) ---
//
// FIXTURE CONSTRAINTS:
//   - careflow_step must be code "at0004" with terminology "local" (only one
//     defined in the archetype). Real verb lives in the annotation.
//   - ism_transition is pinned to "completed/finish" — fixture's restricted
//     state-machine doesn't accept other transitions.

export interface MinimalActionData {
  actionTime?: Date;
  /** Logical careflow step name (encoded only in annotation). */
  careflowStep: string;
  annotation: string;
  sdgEventType: string;
}

export function buildMinimalAction(
  ctx: CompositionContext,
  data: MinimalActionData,
): FlatJson {
  const prefix = "minimal";
  const actPrefix = `${prefix}/minimal:0`;
  const actionTime = (data.actionTime ?? ctx.time).toISOString();
  const annotation = `${data.annotation} [careflow=${data.careflowStep}]`;
  return {
    ...rootCtx(prefix, { ...ctx, composerName: annotation }),
    [`${prefix}/category|code`]: "433",
    [`${prefix}/category|value`]: "event",
    [`${prefix}/category|terminology`]: "openehr",
    ...archetypeLang(actPrefix),
    [`${actPrefix}/time`]: actionTime,
    [`${actPrefix}/multimedia`]: `data:text/plain;charset=utf-8,${encodeURIComponent(annotation)}`,
    [`${actPrefix}/multimedia|mediatype`]: "text/plain",
    [`${actPrefix}/multimedia|size`]: annotation.length,
    [`${actPrefix}/ism_transition/careflow_step|code`]: "at0004",
    [`${actPrefix}/ism_transition/careflow_step|value`]: "Completed",
    [`${actPrefix}/ism_transition/careflow_step|terminology`]: "local",
    [`${actPrefix}/ism_transition/current_state|code`]: "532",
    [`${actPrefix}/ism_transition/current_state|value`]: "completed",
    [`${actPrefix}/ism_transition/current_state|terminology`]: "openehr",
    [`${actPrefix}/ism_transition/transition|code`]: "548",
    [`${actPrefix}/ism_transition/transition|value`]: "finish",
    [`${actPrefix}/ism_transition/transition|terminology`]: "openehr",
  };
}

// --- Shape 3: minimal_evaluation.en.v1 (EVALUATION + DV_QUANTITY) ---
//
// FIXTURE CONSTRAINT: quantity|unit must be one of "kg", "mg", "gm".
// Real unit metadata lives in annotation only.
const EVALUATION_ALLOWED_UNITS = ["kg", "mg", "gm"] as const;
type EvaluationUnit = (typeof EVALUATION_ALLOWED_UNITS)[number];

export interface MinimalEvaluationData {
  magnitude: number;
  /** Pinned to mg by default since fixture only allows kg/mg/gm. Pass another
   *  if numerically meaningful — otherwise just lives in annotation. */
  unit?: EvaluationUnit;
  realUnit?: string;
  annotation: string;
  sdgEventType: string;
}

export function buildMinimalEvaluation(
  ctx: CompositionContext,
  data: MinimalEvaluationData,
): FlatJson {
  const prefix = "minimal";
  const evalPrefix = `${prefix}/minimal:0`;
  const unit: EvaluationUnit = data.unit ?? "mg";
  const annotation = data.realUnit
    ? `${data.annotation} [unit=${data.realUnit}]`
    : data.annotation;
  return {
    ...rootCtx(prefix, { ...ctx, composerName: annotation }),
    [`${prefix}/category|code`]: "433",
    [`${prefix}/category|value`]: "event",
    [`${prefix}/category|terminology`]: "openehr",
    ...archetypeLang(evalPrefix),
    [`${evalPrefix}/quantity|magnitude`]: data.magnitude,
    [`${evalPrefix}/quantity|unit`]: unit,
  };
}

// --- SDG-10 domain shapes (replaced fixture-shapes for demo-critical types) ---
//
// INVARIANT 1 — every demo-critical event is its own composition with
//   ctx/time = event time. NEVER stack any_event:N. The dispatcher in
//   LoadPipeline.buildFlat preserves this (one composition per event);
//   downstream changes must not batch.
// INVARIANT 2 — consumers MUST filter on template_id or OBSERVATION/EVALUATION
//   archetype, NOT on composition FLAT-prefix (laboratory_test_result.v1 and
//   time_series.en.v1 share prefix `event_series`).
//
// Annotation parser: SDG carries clinical semantics in
// `TYPE | CODE | DESCRIPTION`. New builders split on `|` to populate the
// structured analyte/medication/diagnosis fields. composer.name keeps the
// raw annotation during the transition window (AC4 rewrites the queries
// that still depend on it).

interface ParsedAnnotation {
  /** Original annotation, trimmed. */
  raw: string;
  /** Middle segment — code (e.g. "HBA1C", "A10BA02", "M16.1") or null. */
  code: string | null;
  /** Trailing segment — clinical description, never null. */
  description: string;
}

function parseAnnotation(annotation: string): ParsedAnnotation {
  const raw = annotation.trim();
  const parts = raw.split("|").map((s) => s.trim()).filter(Boolean);
  // Expected: [type, code, description]. Tolerate missing trailing parts.
  if (parts.length >= 3) {
    return { raw, code: parts[1], description: parts.slice(2).join(" | ") };
  }
  if (parts.length === 2) {
    return { raw, code: parts[1], description: parts[1] };
  }
  return { raw, code: null, description: raw };
}

// --- Shape 4: laboratory_test_result.v1 (P3.0e) ---
//
// OBSERVATION wrapping HISTORY/EVENT/ITEM_TREE/ELEMENTs. Unit is set per
// composition (free in the OPT). composer.name keeps annotation for the
// transition window.

export function buildLabResult(
  ctx: CompositionContext,
  data: TimeSeriesData,
): FlatJson {
  const prefix = "event_series";
  const obsPrefix = `${prefix}/laboratory_test_result:0`;
  const eventTime = (data.eventTime ?? ctx.time).toISOString();
  const parsed = parseAnnotation(data.annotation);
  const analyteName = parsed.code ?? "Unknown analyte";
  return {
    ...rootCtx(prefix, { ...ctx, composerName: data.annotation }),
    [`${prefix}/category|code`]: "433",
    [`${prefix}/category|value`]: "event",
    [`${prefix}/category|terminology`]: "openehr",
    ...archetypeLang(obsPrefix),
    [`${obsPrefix}/any_event:0/time`]: eventTime,
    [`${obsPrefix}/any_event:0/analyte_name`]: analyteName,
    [`${obsPrefix}/any_event:0/analyte_code|code`]: analyteName,
    [`${obsPrefix}/any_event:0/analyte_code|value`]: analyteName,
    [`${obsPrefix}/any_event:0/analyte_code|terminology`]: "local",
    [`${obsPrefix}/any_event:0/analyte_result|magnitude`]: data.magnitude,
    [`${obsPrefix}/any_event:0/analyte_result|unit`]: data.realUnit,
    [`${obsPrefix}/any_event:0/result_comment`]: parsed.description,
  };
}

// --- Shape 5: medication_summary.v1 (P3.0b) ---
//
// EVALUATION wrapping ITEM_TREE/ELEMENTs. COMPOSITION archetype is minimal.v1
// so FLAT-prefix is `minimal` (shared with minimal_action/evaluation, but the
// EVALUATION archetype slug `medication_summary:0` discriminates).

export function buildMedicationSummary(
  ctx: CompositionContext,
  data: MinimalEvaluationData,
): FlatJson {
  const prefix = "minimal";
  const evalPrefix = `${prefix}/medication_summary:0`;
  const parsed = parseAnnotation(data.annotation);
  const atcCode = parsed.code ?? "UNKNOWN";
  const doseDescription = data.realUnit
    ? `${data.magnitude} ${data.realUnit}`
    : String(data.magnitude);
  return {
    ...rootCtx(prefix, { ...ctx, composerName: data.annotation }),
    [`${prefix}/category|code`]: "433",
    [`${prefix}/category|value`]: "event",
    [`${prefix}/category|terminology`]: "openehr",
    ...archetypeLang(evalPrefix),
    [`${evalPrefix}/medication_name`]: parsed.description,
    [`${evalPrefix}/atc_code|code`]: atcCode,
    [`${evalPrefix}/atc_code|value`]: atcCode,
    [`${evalPrefix}/atc_code|terminology`]: "local",
    [`${evalPrefix}/dose_description`]: doseDescription,
    [`${evalPrefix}/start_date`]: ctx.time.toISOString(),
    [`${evalPrefix}/clinical_indication`]: parsed.description,
  };
}

// --- Shape 6: problem_diagnosis.v1 (P3.0c) ---

export function buildProblemDiagnosis(
  ctx: CompositionContext,
  data: MinimalEvaluationData,
): FlatJson {
  const prefix = "minimal";
  const evalPrefix = `${prefix}/problem_diagnosis:0`;
  const parsed = parseAnnotation(data.annotation);
  const icdCode = parsed.code ?? "UNKNOWN";
  return {
    ...rootCtx(prefix, { ...ctx, composerName: data.annotation }),
    [`${prefix}/category|code`]: "433",
    [`${prefix}/category|value`]: "event",
    [`${prefix}/category|terminology`]: "openehr",
    ...archetypeLang(evalPrefix),
    [`${evalPrefix}/diagnosis_name`]: parsed.description,
    [`${evalPrefix}/diagnosis_code|code`]: icdCode,
    [`${evalPrefix}/diagnosis_code|value`]: icdCode,
    [`${evalPrefix}/diagnosis_code|terminology`]: "local",
    [`${evalPrefix}/date_of_onset`]: ctx.time.toISOString(),
    [`${evalPrefix}/clinical_description`]: parsed.description,
  };
}

// --- Shape 7: adverse_reaction_risk.v2 (P3.0d) — Fas 3 AC2 ---
//
// EVALUATION (minimal.v1 composition → FLAT-prefix `minimal`, EVALUATION slug
// `adverse_reaction_risk:0`). Fält per bridge-OPT at0002-at0007. Tar explicita
// fält (rikare än generisk annotation-parse) men behåller annotation i
// composer.name för transition-konsekvens + PATCH B-kontraktet.

export interface AdverseReactionData {
  /** Free-text substansnamn, t.ex. "Penicillin". */
  substanceName: string;
  /** ATC/lokal kod, t.ex. "J01CE" (penicilliner). */
  substanceCode: string;
  /** openEHR-kritikalitet: low / high / unable-to-assess. */
  criticality: string;
  /** Fri-text manifestation, t.ex. "anafylaxi". */
  manifestation: string;
  /** allergy / intolerance / propensity / contraindication. */
  reactionType: string;
  /** "adverse_reaction | CODE | DESC" — composer.name + PATCH B-kontrakt. */
  annotation: string;
  sdgEventType: string;
  eventTime?: Date;
}

export function buildAdverseReaction(
  ctx: CompositionContext,
  data: AdverseReactionData,
): FlatJson {
  const prefix = "minimal";
  const evalPrefix = `${prefix}/adverse_reaction_risk:0`;
  return {
    ...rootCtx(prefix, { ...ctx, composerName: data.annotation }),
    [`${prefix}/category|code`]: "433",
    [`${prefix}/category|value`]: "event",
    [`${prefix}/category|terminology`]: "openehr",
    ...archetypeLang(evalPrefix),
    [`${evalPrefix}/substance_name`]: data.substanceName,
    [`${evalPrefix}/substance_code|code`]: data.substanceCode,
    [`${evalPrefix}/substance_code|value`]: data.substanceName,
    [`${evalPrefix}/substance_code|terminology`]: "local",
    [`${evalPrefix}/criticality|code`]: data.criticality,
    [`${evalPrefix}/criticality|value`]: data.criticality,
    [`${evalPrefix}/criticality|terminology`]: "local",
    [`${evalPrefix}/manifestation`]: data.manifestation,
    [`${evalPrefix}/onset_date`]: (data.eventTime ?? ctx.time).toISOString(),
    [`${evalPrefix}/reaction_type|code`]: data.reactionType,
    [`${evalPrefix}/reaction_type|value`]: data.reactionType,
    [`${evalPrefix}/reaction_type|terminology`]: "local",
  };
}

// --- Event router ---

export type SdgEventType =
  | "primary_care_encounter"
  | "vital_signs"
  | "lab_order"
  | "lab_result"
  | "problem_diagnosis"
  | "medication_statement"
  | "referral"
  | "specialist_consultation"
  | "care_plan"
  | "discharge_summary"
  | "adverse_reaction"; // Fas 3 AC2

export type ShapeId =
  | "time_series.en.v1"
  | "minimal_action.en.v1"
  | "minimal_evaluation.en.v1"
  | "laboratory_test_result.v1"
  | "medication_summary.v1"
  | "problem_diagnosis.v1"
  | "adverse_reaction_risk.v2";

// SDG-10: lab/medication/diagnosis routed to domain OPTs. Fas 3 AC2 adds
// adverse_reaction → adverse_reaction_risk.v2 (Ingrids penicillinallergi +
// metformin-bärares E11 hanteras via pathway-härledning, ej här). Övriga 6
// event-typer kvar i fixture-shapes (ej demo-kritiska för mall-tjänsten).
export const EVENT_SHAPE_MAP: Record<SdgEventType, ShapeId> = {
  primary_care_encounter: "minimal_action.en.v1",     // fixture (kvar)
  vital_signs: "time_series.en.v1",                   // fixture (kvar)
  lab_order: "minimal_action.en.v1",                  // fixture (kvar)
  lab_result: "laboratory_test_result.v1",            // SDG-10 migrated
  problem_diagnosis: "problem_diagnosis.v1",          // SDG-10 migrated
  medication_statement: "medication_summary.v1",      // SDG-10 migrated
  referral: "minimal_action.en.v1",                   // fixture (kvar)
  specialist_consultation: "minimal_action.en.v1",    // fixture (kvar)
  care_plan: "minimal_evaluation.en.v1",              // fixture (kvar)
  discharge_summary: "minimal_evaluation.en.v1",      // fixture (kvar)
  adverse_reaction: "adverse_reaction_risk.v2",       // Fas 3 AC2
};
