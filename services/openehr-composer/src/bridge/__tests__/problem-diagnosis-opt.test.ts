import { describe, expect, it } from "vitest";
import { create } from "xmlbuilder2";
import {
  buildProblemDiagnosisOpt,
  PD_DEFAULT_TEMPLATE_ID,
  PROBLEM_DIAGNOSIS_ELEMENTS,
} from "../problem-diagnosis-opt.js";

const EHRBASE_URL = process.env.EHRBASE_URL;
const integrationGuard = EHRBASE_URL ? it : it.skip;

describe("problem-diagnosis-opt (unit)", () => {
  it("AC-P1 — output is parseable XML", () => {
    const xml = buildProblemDiagnosisOpt();
    expect(() => create(xml)).not.toThrow();
    expect(xml.length).toBeGreaterThan(2000);
  });

  it("AC-P2 — root <template> has openEHR namespace", () => {
    const xml = buildProblemDiagnosisOpt();
    const obj = create(xml).end({ format: "object" }) as Record<string, unknown>;
    expect(obj.template).toBeDefined();
    const tpl = obj.template as Record<string, unknown>;
    expect(tpl["@xmlns"]).toBe("http://schemas.openehr.org/v1");
  });

  it("AC-P3 — template_id is 'problem_diagnosis.v1'", () => {
    const xml = buildProblemDiagnosisOpt();
    expect(xml).toMatch(/<value>problem_diagnosis\.v1<\/value>/);
  });

  it("AC-P4 — six clinical fields present with expected at-codes", () => {
    expect(PROBLEM_DIAGNOSIS_ELEMENTS.map((e) => e.nodeId)).toEqual([
      "at0002",
      "at0003",
      "at0004",
      "at0005",
      "at0006",
      "at0007",
    ]);
    expect(PROBLEM_DIAGNOSIS_ELEMENTS.find((e) => e.label === "diagnosis_name")?.required).toBe(true);
  });

  it("AC-P5 — diagnosis_code is optional (DV_CODED_TEXT, tolerant)", () => {
    const slot = PROBLEM_DIAGNOSIS_ELEMENTS.find((e) => e.label === "diagnosis_code");
    expect(slot).toBeDefined();
    expect(slot?.required).toBeUndefined();
  });

  it("AC-P6 — overridden templateId/concept/uid flow into the XML", () => {
    const xml = buildProblemDiagnosisOpt({
      templateId: "diag.v99",
      concept: "Custom diag concept",
      uid: "00000000-0000-4000-8000-000000000099",
    });
    expect(xml).toContain("diag.v99");
    expect(xml).toContain("Custom diag concept");
    expect(xml).toContain("00000000-0000-4000-8000-000000000099");
  });

  it("AC-P7 — output is deterministic across calls", () => {
    expect(buildProblemDiagnosisOpt()).toBe(buildProblemDiagnosisOpt());
  });
});

describe("problem-diagnosis-opt (integration — EHRBASE_URL required)", () => {
  integrationGuard(
    "AC-P8 — OPT POSTs to EHRbase with 201 or 409",
    { timeout: 15_000 },
    async () => {
      const xml = buildProblemDiagnosisOpt();
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
    "AC-P9 — GET /definition/template/adl1.4 lists problem_diagnosis.v1",
    { timeout: 10_000 },
    async () => {
      const resp = await fetch(
        `${EHRBASE_URL}/ehrbase/rest/openehr/v1/definition/template/adl1.4`,
        { headers: { Accept: "application/json" } },
      );
      expect(resp.status).toBe(200);
      const body = (await resp.json()) as Array<{ template_id: string }>;
      expect(body.map((t) => t.template_id)).toContain(PD_DEFAULT_TEMPLATE_ID);
    },
  );
});
