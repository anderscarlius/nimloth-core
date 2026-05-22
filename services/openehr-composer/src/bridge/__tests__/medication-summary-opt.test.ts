import { describe, expect, it, vi } from "vitest";
import { create } from "xmlbuilder2";
import pino from "pino";
import {
  buildMedicationSummaryOpt,
  DEFAULT_TEMPLATE_ID,
  MEDICATION_SUMMARY_ELEMENTS,
} from "../medication-summary-opt.js";
import {
  buildAuditEvent,
  createBridgeAuditPublisher,
  isKafkaDisabled,
} from "../bridge-audit.js";

const EHRBASE_URL = process.env.EHRBASE_URL;
const integrationGuard = EHRBASE_URL ? it : it.skip;

describe("medication-summary-opt (unit)", () => {
  it("AC-F1 — buildMedicationSummaryOpt() returns parseable XML", () => {
    const xml = buildMedicationSummaryOpt();
    expect(() => create(xml)).not.toThrow();
    expect(xml.length).toBeGreaterThan(2000);
  });

  it("AC-F2 — root element is <template> with openEHR namespace", () => {
    const xml = buildMedicationSummaryOpt();
    const obj = create(xml).end({ format: "object" }) as Record<string, unknown>;
    expect(obj.template).toBeDefined();
    const tpl = obj.template as Record<string, unknown>;
    expect(tpl["@xmlns"]).toBe("http://schemas.openehr.org/v1");
  });

  it("AC-F3 — template_id element contains 'medication_summary.v1'", () => {
    const xml = buildMedicationSummaryOpt();
    expect(xml).toContain("<template_id>");
    expect(xml).toMatch(/<value>medication_summary\.v1<\/value>/);
  });

  it("AC-F4 — medication_name ELEMENT is present in the structure", () => {
    const xml = buildMedicationSummaryOpt();
    // Each element has term_definitions describing its label.
    expect(xml).toContain("medication_name");
    const medSlot = MEDICATION_SUMMARY_ELEMENTS.find((e) => e.label === "medication_name");
    expect(medSlot).toBeDefined();
    expect(medSlot?.nodeId).toBe("at0002");
    expect(medSlot?.required).toBe(true);
  });

  it("AC-F5 — atc_code is DV_CODED_TEXT but optional, allowing DV_TEXT degradation at composition time", () => {
    const xml = buildMedicationSummaryOpt();
    expect(xml).toContain("atc_code");
    const slot = MEDICATION_SUMMARY_ELEMENTS.find((e) => e.label === "atc_code");
    expect(slot).toBeDefined();
    expect(slot?.required).toBeUndefined(); // optional → degradation allowed
  });

  it("AC-F6 — overridden templateId/concept flow into the XML", () => {
    const xml = buildMedicationSummaryOpt({
      templateId: "custom.v9",
      concept: "Custom concept",
      uid: "deadbeef-dead-beef-dead-beefdeadbeef",
    });
    expect(xml).toContain("custom.v9");
    expect(xml).toContain("Custom concept");
    expect(xml).toContain("deadbeef-dead-beef-dead-beefdeadbeef");
  });

  it("AC-F7 — output is deterministic across calls (same UID, same byte length)", () => {
    const a = buildMedicationSummaryOpt();
    const b = buildMedicationSummaryOpt();
    expect(a).toBe(b);
  });
});

describe("bridge-audit (unit)", () => {
  it("AC-F8 — disabled brokers → log-only publisher; emit() does not throw", async () => {
    const logger = pino({ level: "silent" });
    const infoSpy = vi.spyOn(logger, "info");
    const pub = createBridgeAuditPublisher(
      { brokers: ["disabled"], clientId: "test", topic: "core.audit.access" },
      logger,
    );
    await pub.emit("BRIDGE_COMPILE", { templateId: DEFAULT_TEMPLATE_ID });
    expect(infoSpy).toHaveBeenCalled();
    const call = infoSpy.mock.calls.find((args) => typeof args[1] === "string" && (args[1] as string).includes("bridge audit"));
    expect(call).toBeDefined();
    await pub.stop();
  });

  it("AC-F9 — BRIDGE_VALIDATE_FAIL builds an event with outcome ERROR by default", () => {
    const ev = buildAuditEvent("BRIDGE_VALIDATE_FAIL", "x.v1", "ERROR", {});
    expect(ev.outcome).toBe("ERROR");
    expect(ev.action).toBe("BRIDGE_VALIDATE_FAIL");
    expect(ev.actor.role).toBe("system");
    expect(ev.patient_id).toBeNull();
  });

  it("isKafkaDisabled() detects the three disabled forms", () => {
    expect(isKafkaDisabled([])).toBe(true);
    expect(isKafkaDisabled([""])).toBe(true);
    expect(isKafkaDisabled(["disabled"])).toBe(true);
    expect(isKafkaDisabled(["kafka:9092"])).toBe(false);
  });
});

describe("medication-summary-opt (integration — EHRBASE_URL required)", () => {
  integrationGuard(
    "AC-F10 — OPT POSTs to EHRbase with 201 or 409",
    { timeout: 15_000 },
    async () => {
      const xml = buildMedicationSummaryOpt();
      const resp = await fetch(
        `${EHRBASE_URL}/ehrbase/rest/openehr/v1/definition/template/adl1.4`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/xml",
            Accept: "application/xml",
            Prefer: "return=minimal",
          },
          body: xml,
        },
      );
      expect([201, 409]).toContain(resp.status);
    },
  );

  integrationGuard(
    "AC-F11 — GET /definition/template/adl1.4 lists medication_summary.v1",
    { timeout: 10_000 },
    async () => {
      const resp = await fetch(
        `${EHRBASE_URL}/ehrbase/rest/openehr/v1/definition/template/adl1.4`,
        { headers: { Accept: "application/json" } },
      );
      expect(resp.status).toBe(200);
      const body = (await resp.json()) as Array<{ template_id: string }>;
      const ids = body.map((t) => t.template_id);
      expect(ids).toContain(DEFAULT_TEMPLATE_ID);
    },
  );
});
