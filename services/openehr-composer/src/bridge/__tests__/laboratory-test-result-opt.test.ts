import { describe, expect, it } from "vitest";
import { create } from "xmlbuilder2";
import {
  buildLaboratoryTestResultOpt,
  LAB_DEFAULT_TEMPLATE_ID,
  LABORATORY_TEST_RESULT_ELEMENTS,
} from "../laboratory-test-result-opt.js";

const EHRBASE_URL = process.env.EHRBASE_URL;
const integrationGuard = EHRBASE_URL ? it : it.skip;

describe("laboratory-test-result-opt (unit)", () => {
  it("AC-L1 — output is parseable XML", () => {
    const xml = buildLaboratoryTestResultOpt();
    expect(() => create(xml)).not.toThrow();
    expect(xml.length).toBeGreaterThan(2000);
  });

  it("AC-L2 — root <template> has openEHR namespace", () => {
    const xml = buildLaboratoryTestResultOpt();
    const obj = create(xml).end({ format: "object" }) as Record<string, unknown>;
    expect(obj.template).toBeDefined();
    const tpl = obj.template as Record<string, unknown>;
    expect(tpl["@xmlns"]).toBe("http://schemas.openehr.org/v1");
  });

  it("AC-L3 — template_id is 'laboratory_test_result.v1'", () => {
    const xml = buildLaboratoryTestResultOpt();
    expect(xml).toMatch(/<value>laboratory_test_result\.v1<\/value>/);
  });

  it("AC-L4 — OBSERVATION archetype is laboratory_test_result.v1, COMPOSITION is event_series.v1", () => {
    const xml = buildLaboratoryTestResultOpt();
    expect(xml).toContain("openEHR-EHR-OBSERVATION.laboratory_test_result.v1");
    expect(xml).toContain("openEHR-EHR-COMPOSITION.event_series.v1");
  });

  it("AC-L5 — seven analyte fields present with expected at-codes", () => {
    expect(LABORATORY_TEST_RESULT_ELEMENTS.map((e) => e.nodeId)).toEqual([
      "at0004",
      "at0005",
      "at0006",
      "at0007",
      "at0008",
      "at0009",
      "at0010",
    ]);
    expect(
      LABORATORY_TEST_RESULT_ELEMENTS.find((e) => e.label === "analyte_name")?.required,
    ).toBe(true);
    expect(
      LABORATORY_TEST_RESULT_ELEMENTS.find((e) => e.label === "analyte_result")?.required,
    ).toBe(true);
  });

  it("AC-L6 — DV_QUANTITY on analyte_result is unconstrained on unit (no <units> in OPT body for at0006)", () => {
    const xml = buildLaboratoryTestResultOpt();
    // The OPT must NOT pin a unit on at0006 — heterogeneous analytes share the template.
    // We assert by checking that no <units> element appears anywhere in the template
    // (no element of ours uses a constrained unit). This guards against accidental
    // copy-paste from time_series which pins units=mm3.
    expect(xml).not.toMatch(/<units>[^<]+<\/units>/);
  });

  it("AC-L7 — HISTORY/EVENT scaffolding present (OBSERVATION-shape, not EVALUATION)", () => {
    const xml = buildLaboratoryTestResultOpt();
    expect(xml).toContain("HISTORY");
    expect(xml).toContain("EVENT");
    expect(xml).toContain("rm_type_name>OBSERVATION");
  });

  it("AC-L8 — overridden templateId/concept/uid flow into the XML", () => {
    const xml = buildLaboratoryTestResultOpt({
      templateId: "lab.v99",
      concept: "Custom lab concept",
      uid: "00000000-0000-4000-8000-0000000000ab",
    });
    expect(xml).toContain("lab.v99");
    expect(xml).toContain("Custom lab concept");
    expect(xml).toContain("00000000-0000-4000-8000-0000000000ab");
  });

  it("AC-L9 — output is deterministic across calls (byte-stable for diff)", () => {
    const a = buildLaboratoryTestResultOpt();
    const b = buildLaboratoryTestResultOpt();
    expect(a).toBe(b);
  });
});

describe("laboratory-test-result-opt (integration — EHRBASE_URL required)", () => {
  integrationGuard(
    "AC-L10 — OPT POSTs to EHRbase with 201 or 409",
    { timeout: 15_000 },
    async () => {
      const xml = buildLaboratoryTestResultOpt();
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
    "AC-L11 — GET /definition/template/adl1.4 lists laboratory_test_result.v1",
    { timeout: 10_000 },
    async () => {
      const resp = await fetch(
        `${EHRBASE_URL}/ehrbase/rest/openehr/v1/definition/template/adl1.4`,
        { headers: { Accept: "application/json" } },
      );
      expect(resp.status).toBe(200);
      const body = (await resp.json()) as Array<{ template_id: string }>;
      const ids = body.map((t) => t.template_id);
      expect(ids).toContain(LAB_DEFAULT_TEMPLATE_ID);
    },
  );
});
