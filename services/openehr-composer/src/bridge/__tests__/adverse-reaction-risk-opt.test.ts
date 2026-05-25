import { describe, expect, it } from "vitest";
import { create } from "xmlbuilder2";
import {
  buildAdverseReactionRiskOpt,
  ARR_DEFAULT_TEMPLATE_ID,
  ADVERSE_REACTION_RISK_ELEMENTS,
} from "../adverse-reaction-risk-opt.js";

const EHRBASE_URL = process.env.EHRBASE_URL;
const integrationGuard = EHRBASE_URL ? it : it.skip;

describe("adverse-reaction-risk-opt (unit)", () => {
  it("AC-A1 — parseable XML", () => {
    const xml = buildAdverseReactionRiskOpt();
    expect(() => create(xml)).not.toThrow();
    expect(xml.length).toBeGreaterThan(2000);
  });

  it("AC-A2 — openEHR namespace on <template>", () => {
    const xml = buildAdverseReactionRiskOpt();
    const obj = create(xml).end({ format: "object" }) as Record<string, unknown>;
    expect(obj.template).toBeDefined();
    expect((obj.template as Record<string, unknown>)["@xmlns"]).toBe("http://schemas.openehr.org/v1");
  });

  it("AC-A3 — template_id is 'adverse_reaction_risk.v2'", () => {
    const xml = buildAdverseReactionRiskOpt();
    expect(xml).toMatch(/<value>adverse_reaction_risk\.v2<\/value>/);
  });

  it("AC-A4 — six clinical fields at expected at-codes", () => {
    expect(ADVERSE_REACTION_RISK_ELEMENTS.map((e) => e.nodeId)).toEqual([
      "at0002",
      "at0003",
      "at0004",
      "at0005",
      "at0006",
      "at0007",
    ]);
    expect(ADVERSE_REACTION_RISK_ELEMENTS.find((e) => e.label === "substance_name")?.required).toBe(true);
  });

  it("AC-A5 — substance_code is optional (DV_CODED_TEXT, tolerant)", () => {
    const slot = ADVERSE_REACTION_RISK_ELEMENTS.find((e) => e.label === "substance_code");
    expect(slot).toBeDefined();
    expect(slot?.required).toBeUndefined();
  });

  it("AC-A6 — overrides propagate to XML", () => {
    const xml = buildAdverseReactionRiskOpt({
      templateId: "allergy.v99",
      concept: "Override allergy",
      uid: "00000000-0000-4000-8000-0000000000aa",
    });
    expect(xml).toContain("allergy.v99");
    expect(xml).toContain("Override allergy");
    expect(xml).toContain("00000000-0000-4000-8000-0000000000aa");
  });

  it("AC-A7 — deterministic across calls", () => {
    expect(buildAdverseReactionRiskOpt()).toBe(buildAdverseReactionRiskOpt());
  });
});

describe("adverse-reaction-risk-opt (integration — EHRBASE_URL required)", () => {
  integrationGuard(
    "AC-A8 — OPT POSTs to EHRbase with 201 or 409",
    { timeout: 15_000 },
    async () => {
      const xml = buildAdverseReactionRiskOpt();
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
    "AC-A9 — GET /definition/template/adl1.4 lists adverse_reaction_risk.v2",
    { timeout: 10_000 },
    async () => {
      const resp = await fetch(
        `${EHRBASE_URL}/ehrbase/rest/openehr/v1/definition/template/adl1.4`,
        { headers: { Accept: "application/json" } },
      );
      expect(resp.status).toBe(200);
      const body = (await resp.json()) as Array<{ template_id: string }>;
      expect(body.map((t) => t.template_id)).toContain(ARR_DEFAULT_TEMPLATE_ID);
    },
  );
});
