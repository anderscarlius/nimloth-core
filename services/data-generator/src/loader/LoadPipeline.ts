import { writeFileSync, mkdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createEhr,
  postCompositionFlat,
  EhrbaseError,
} from "../ehrbase-client.js";
import {
  buildTimeSeries,
  buildMinimalAction,
  buildMinimalEvaluation,
  EVENT_SHAPE_MAP,
  type CompositionContext,
} from "../composers/index.js";
import type { PatientTimeline, TimelineEvent } from "../engine/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, "..", "..");
const ERROR_DIR = join(PKG_ROOT, "data", "errors");

const COMPOSER = "Nimloth SDG";
const DAY0 = new Date("2026-01-08T08:30:00Z");

function plusDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

function buildFlat(event: TimelineEvent, ctx: CompositionContext): Record<string, unknown> {
  const shape = EVENT_SHAPE_MAP[event.eventType];
  switch (shape) {
    case "time_series.en.v1":
      return buildTimeSeries(ctx, {
        magnitude: event.clinicalData.magnitude ?? 0,
        realUnit: event.clinicalData.realUnit ?? "1",
        annotation: event.clinicalData.annotation,
        sdgEventType: event.eventType,
      });
    case "minimal_action.en.v1":
      return buildMinimalAction(ctx, {
        careflowStep: event.clinicalData.careflowStep ?? event.eventType,
        annotation: event.clinicalData.annotation,
        sdgEventType: event.eventType,
      });
    case "minimal_evaluation.en.v1":
      return buildMinimalEvaluation(ctx, {
        magnitude: event.clinicalData.magnitude ?? 1,
        annotation: event.clinicalData.annotation,
        realUnit: event.clinicalData.realUnit,
        sdgEventType: event.eventType,
      });
  }
}

interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
}

const DEFAULT_RETRY: RetryOptions = { maxRetries: 3, baseDelayMs: 1000 };

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function postWithRetry(
  ehrId: string,
  templateId: string,
  flat: Record<string, unknown>,
  retryOpts: RetryOptions,
): Promise<string> {
  let attempt = 0;
  let lastErr: unknown;
  while (attempt <= retryOpts.maxRetries) {
    try {
      return await postCompositionFlat(ehrId, templateId, flat);
    } catch (err) {
      lastErr = err;
      if (err instanceof EhrbaseError) {
        if (err.status === 429) {
          await sleep(retryOpts.baseDelayMs * 2 ** attempt);
          attempt++;
          continue;
        }
        if (err.status === 422) {
          // Log payload to errors dir and re-throw
          mkdirSync(ERROR_DIR, { recursive: true });
          const file = join(
            ERROR_DIR,
            `422-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`,
          );
          writeFileSync(file, JSON.stringify({ ehrId, templateId, flat, body: err.body }, null, 2));
        }
      }
      throw err;
    }
  }
  throw lastErr ?? new Error("retry exhausted");
}

export interface LoadOptions {
  dryRun?: boolean;
  retry?: Partial<RetryOptions>;
  namespace?: string;
}

export interface PatientLoadResult {
  patientId: string;
  ehrId?: string;
  compositionUids: string[];
  failed: number;
  errors: string[];
  startedAt: string;
  finishedAt: string;
}

export async function loadTimelines(
  timelines: PatientTimeline[],
  opts: LoadOptions = {},
): Promise<PatientLoadResult[]> {
  const retryOpts = { ...DEFAULT_RETRY, ...(opts.retry ?? {}) };
  const results: PatientLoadResult[] = [];

  for (const tl of timelines) {
    const startedAt = new Date().toISOString();
    const errors: string[] = [];
    const uids: string[] = [];
    let ehrId: string | undefined;

    try {
      if (!opts.dryRun) {
        ehrId = await createEhr(tl.patientId, opts.namespace ?? "NIMLOTH");
      } else {
        ehrId = `DRY-${tl.patientId}`;
      }
    } catch (err) {
      errors.push(`createEhr: ${err instanceof EhrbaseError ? `HTTP ${err.status}` : err}`);
      results.push({
        patientId: tl.patientId,
        compositionUids: [],
        failed: tl.events.length,
        errors,
        startedAt,
        finishedAt: new Date().toISOString(),
      });
      continue;
    }

    for (const evt of tl.events) {
      const ctx: CompositionContext = {
        language: "sv",
        territory: "SE",
        composerName: COMPOSER,
        time: plusDays(DAY0, evt.dayOffset),
      };
      const flat = buildFlat(evt, ctx);
      const templateId = EVENT_SHAPE_MAP[evt.eventType];

      if (opts.dryRun) {
        uids.push(`DRY-${templateId}-${evt.dayOffset}`);
        continue;
      }

      try {
        const uid = await postWithRetry(ehrId, templateId, flat, retryOpts);
        uids.push(uid);
      } catch (err) {
        errors.push(
          `${evt.eventType}@day${evt.dayOffset}: ${err instanceof EhrbaseError ? `HTTP ${err.status}` : err}`,
        );
      }
    }

    results.push({
      patientId: tl.patientId,
      ehrId,
      compositionUids: uids,
      failed: tl.events.length - uids.length,
      errors,
      startedAt,
      finishedAt: new Date().toISOString(),
    });
  }

  return results;
}
