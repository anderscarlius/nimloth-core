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
  // ctx.time is therefore only used for per-event timestamps inside the archetype.
  return {
    [`${prefix}/language|code`]: ctx.language,
    [`${prefix}/language|terminology`]: "ISO_639-1",
    [`${prefix}/territory|code`]: ctx.territory,
    [`${prefix}/territory|terminology`]: "ISO_3166-1",
    [`${prefix}/composer|name`]: ctx.composerName,
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
  | "discharge_summary";

export type ShapeId =
  | "time_series.en.v1"
  | "minimal_action.en.v1"
  | "minimal_evaluation.en.v1";

export const EVENT_SHAPE_MAP: Record<SdgEventType, ShapeId> = {
  primary_care_encounter: "minimal_action.en.v1",
  vital_signs: "time_series.en.v1",
  lab_order: "minimal_action.en.v1",
  lab_result: "time_series.en.v1",
  problem_diagnosis: "minimal_evaluation.en.v1",
  medication_statement: "minimal_evaluation.en.v1",
  referral: "minimal_action.en.v1",
  specialist_consultation: "minimal_action.en.v1",
  care_plan: "minimal_evaluation.en.v1",
  discharge_summary: "minimal_evaluation.en.v1",
};
