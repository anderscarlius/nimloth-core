#!/usr/bin/env tsx
// P3.0b Path A — load bridge-generated OPT templates into EHRbase.
//
// Run via:
//   pnpm --filter @nimloth-core/openehr-composer exec tsx \
//     src/bridge/scripts/load-bridge-templates.ts
// Or via root-level: pnpm openehr:load-bridge-templates
//
// Env:
//   EHRBASE_URL       — default http://localhost:8088
//   KAFKA_BROKERS     — empty / 'disabled' → audit log-only
//   KAFKA_AUDIT_TOPIC — default 'core.audit.access'
//   BRIDGE_TRIGGERED_BY — recorded in audit details (default 'manual-cli')
//
// Exit:
//   0 — all loaded (201) or already present (409)
//   1 — fatal (EHRbase down)
//   2 — at least one template rejected (4xx/5xx other than 409)

import pino from "pino";
import {
  buildAdverseReactionRiskOpt,
  buildLaboratoryTestResultOpt,
  buildMedicationSummaryOpt,
  buildProblemDiagnosisOpt,
  buildProgressNoteOpt,
  createBridgeAuditPublisher,
  ARR_DEFAULT_TEMPLATE_ID,
  DEFAULT_TEMPLATE_ID,
  LAB_DEFAULT_TEMPLATE_ID,
  PD_DEFAULT_TEMPLATE_ID,
  PROGRESS_NOTE_DEFAULT_TEMPLATE_ID,
} from "../index.js";

const EHRBASE_URL = process.env.EHRBASE_URL ?? "http://localhost:8088";
const TEMPLATE_ENDPOINT = `${EHRBASE_URL}/ehrbase/rest/openehr/v1/definition/template/adl1.4`;
const KAFKA_BROKERS = (process.env.KAFKA_BROKERS ?? "disabled")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const TOPIC = process.env.KAFKA_AUDIT_TOPIC ?? "core.audit.access";
const TRIGGERED_BY = process.env.BRIDGE_TRIGGERED_BY ?? "manual-cli";

const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: "load-bridge-templates" },
});

const audit = createBridgeAuditPublisher(
  { brokers: KAFKA_BROKERS, clientId: "bridge-loader", topic: TOPIC },
  logger,
);

interface TemplateSpec {
  templateId: string;
  build: () => string;
}

const TEMPLATES: TemplateSpec[] = [
  { templateId: DEFAULT_TEMPLATE_ID, build: () => buildMedicationSummaryOpt() },
  { templateId: PD_DEFAULT_TEMPLATE_ID, build: () => buildProblemDiagnosisOpt() },
  { templateId: ARR_DEFAULT_TEMPLATE_ID, build: () => buildAdverseReactionRiskOpt() },
  { templateId: LAB_DEFAULT_TEMPLATE_ID, build: () => buildLaboratoryTestResultOpt() },
  { templateId: PROGRESS_NOTE_DEFAULT_TEMPLATE_ID, build: () => buildProgressNoteOpt() },
];

async function ensureEhrbaseUp(): Promise<void> {
  const r = await fetch(`${EHRBASE_URL}/ehrbase/`);
  if (!r.ok) throw new Error(`EHRbase root → HTTP ${r.status}`);
}

async function loadOne(spec: TemplateSpec): Promise<{ ok: boolean; status: number; alreadyLoaded: boolean; body?: string }> {
  const xml = spec.build();
  const resp = await fetch(TEMPLATE_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/xml",
      Accept: "application/xml",
      Prefer: "return=minimal",
    },
    body: xml,
  });

  if (resp.status === 201) {
    await audit.emit("BRIDGE_COMPILE", {
      templateId: spec.templateId,
      outcome: "SUCCESS",
      details: { triggeredBy: TRIGGERED_BY, optBytes: xml.length, ehrbaseStatus: 201 },
    });
    return { ok: true, status: 201, alreadyLoaded: false };
  }
  if (resp.status === 409) {
    await audit.emit("BRIDGE_RELOAD", {
      templateId: spec.templateId,
      outcome: "SUCCESS",
      details: { triggeredBy: TRIGGERED_BY, ehrbaseStatus: 409 },
    });
    return { ok: true, status: 409, alreadyLoaded: true };
  }
  const body = await resp.text();
  await audit.emit("BRIDGE_VALIDATE_FAIL", {
    templateId: spec.templateId,
    outcome: "ERROR",
    details: {
      triggeredBy: TRIGGERED_BY,
      ehrbaseStatus: resp.status,
      responseSnippet: body.slice(0, 500),
    },
  });
  return { ok: false, status: resp.status, alreadyLoaded: false, body };
}

async function main(): Promise<void> {
  await ensureEhrbaseUp();
  logger.info(
    { EHRBASE_URL, templates: TEMPLATES.map((t) => t.templateId) },
    "loading bridge templates",
  );

  let failures = 0;
  for (const spec of TEMPLATES) {
    try {
      const r = await loadOne(spec);
      if (!r.ok) {
        logger.error(
          { templateId: spec.templateId, status: r.status, body: r.body?.slice(0, 200) },
          "load FAILED",
        );
        failures++;
      } else {
        logger.info(
          { templateId: spec.templateId, status: r.status, alreadyLoaded: r.alreadyLoaded },
          r.alreadyLoaded ? "template already loaded" : "template loaded",
        );
      }
    } catch (err) {
      logger.error({ err: String(err), templateId: spec.templateId }, "unexpected error");
      failures++;
    }
  }

  await audit.stop();

  if (failures > 0) process.exit(2);
  logger.info("all bridge templates green");
}

main().catch((err) => {
  logger.error({ err: String(err) }, "fatal");
  process.exit(1);
});
