import { describe, expect, it, beforeAll } from "vitest";
import request from "supertest";
import pino from "pino";
import { createServer } from "../server.js";
import { TemplateRegistry } from "../registry.js";
import { ALL_TEMPLATES } from "../templates/index.js";

const EHRBASE_BASE_URL =
  process.env.EHRBASE_BASE_URL ?? "http://192.168.1.189:11401/ehrbase";

describe("server — endpoints (unit, no EHRbase)", () => {
  const logger = pino({ level: "silent" });
  const registry = new TemplateRegistry(ALL_TEMPLATES);
  const app = createServer({ registry, ehrbaseBaseUrl: EHRBASE_BASE_URL, logger });

  it("GET /health returns ok + template count", async () => {
    const r = await request(app).get("/health");
    expect(r.status).toBe(200);
    expect(r.body.status).toBe("ok");
    expect(r.body.templates).toBe(8);
  });

  it("GET /api/aql-templates lists 8 honest templates", async () => {
    const r = await request(app).get("/api/aql-templates");
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(8);
    expect(r.body.templates).toHaveLength(8);
    expect(r.body.templates.every((t: { metadata: { tier: string } }) => t.metadata.tier === "honest")).toBe(true);
  });

  it("GET /api/aql-templates/{id} returns descriptor (no aql, no postProcess)", async () => {
    const r = await request(app).get("/api/aql-templates/se.nimloth.aql.observation_trend_by_period");
    expect(r.status).toBe(200);
    expect(r.body.id).toBe("se.nimloth.aql.observation_trend_by_period");
    expect(r.body.aql).toBeUndefined();
    expect(r.body.postProcess).toBeUndefined();
  });

  it("GET /api/aql-templates/unknown returns 404 with structured error", async () => {
    const r = await request(app).get("/api/aql-templates/foo");
    expect(r.status).toBe(404);
    expect(r.body.error).toBe("template_not_found");
  });

  it("POST execute rejects missing required param", async () => {
    const r = await request(app)
      .post("/api/aql-templates/se.nimloth.aql.observation_trend_by_period/execute")
      .send({ params: {} });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("parameter_validation_failed");
    expect(r.body.details.field).toBe("patient_id");
  });

  it("POST execute rejects unknown param", async () => {
    const r = await request(app)
      .post("/api/aql-templates/se.nimloth.aql.observation_trend_by_period/execute")
      .send({ params: { patient_id: "lars-johansson-syn-001", evil_typo: "x" } });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("parameter_validation_failed");
  });
});

// Integration — exercises live EHRbase. Skip unless EHRBASE_BASE_URL points
// to a reachable instance.
const integration = process.env.SKIP_EHRBASE_INT === "1" ? describe.skip : describe;

integration("server — execute (integration, hits EHRbase)", () => {
  const logger = pino({ level: "silent" });
  const registry = new TemplateRegistry(ALL_TEMPLATES);
  const app = createServer({ registry, ehrbaseBaseUrl: EHRBASE_BASE_URL, logger });

  it("AC4-S5 — Lars HbA1c-trend returns >=2 distinct context/start_time (INVARIANT 1)", async () => {
    const r = await request(app)
      .post("/api/aql-templates/se.nimloth.aql.observation_trend_by_period/execute")
      .send({ params: { patient_id: "lars-johansson-syn-001" } });
    expect(r.status).toBe(200);
    expect(r.body.template_id).toBe("se.nimloth.aql.observation_trend_by_period");
    expect(Array.isArray(r.body.rows)).toBe(true);
    const stamps = new Set(r.body.rows.map((row: { timestamp: string }) => row.timestamp));
    expect(stamps.size).toBeGreaterThanOrEqual(2);
  }, 30_000);

  it("Eva (non-responder) returns a row from nonresponder-template", async () => {
    const r = await request(app)
      .post("/api/aql-templates/se.nimloth.aql.nonresponder_after_rx/execute")
      .send({ params: { patient_id: "eva-lindgren-syn-001" } });
    expect(r.status).toBe(200);
    expect(r.body.row_count).toBeGreaterThanOrEqual(1);
  }, 30_000);

  it("Anders (dropout) reports status='dropout' from diabetes_without_followup", async () => {
    const r = await request(app)
      .post("/api/aql-templates/se.nimloth.aql.diabetes_without_followup/execute")
      .send({ params: { patient_id: "anders-bergstrom-syn-001" } });
    expect(r.status).toBe(200);
    expect(r.body.rows[0].status).toBe("dropout");
  }, 30_000);

  it("PATCH de-konflation — Lars + Eva are NOT dropout (they have followup)", async () => {
    for (const pid of ["lars-johansson-syn-001", "eva-lindgren-syn-001"]) {
      const r = await request(app)
        .post("/api/aql-templates/se.nimloth.aql.diabetes_without_followup/execute")
        .send({ params: { patient_id: pid } });
      expect(r.status).toBe(200);
      expect(r.body.rows[0].status).toBe("on_track");
    }
  }, 30_000);

  it("PATCH — followup_window_days param is removed (strict binder rejects it)", async () => {
    const r = await request(app)
      .post("/api/aql-templates/se.nimloth.aql.diabetes_without_followup/execute")
      .send({ params: { patient_id: "anders-bergstrom-syn-001", followup_window_days: 90 } });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("parameter_validation_failed");
  }, 30_000);
});
