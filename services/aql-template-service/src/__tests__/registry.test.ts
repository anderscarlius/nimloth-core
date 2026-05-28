import { describe, expect, it } from "vitest";
import { TemplateRegistry, RegistryValidationError, validateTemplate } from "../registry.js";
import { ALL_TEMPLATES } from "../templates/index.js";
import type { TemplateDefinition } from "../types.js";

describe("registry — S3 + S4 validators", () => {
  it("AC3 — loads all 8 honest templates without error", () => {
    const r = new TemplateRegistry(ALL_TEMPLATES);
    expect(r.size()).toBe(8);
    expect(r.list().every((t) => t.metadata.tier === "honest")).toBe(true);
  });

  it("AC7-S4 — auto-rejects FLAT-prefix-filtrerande template (composer.name LIKE)", () => {
    const bad: TemplateDefinition = {
      id: "se.nimloth.aql.bad_composer_like",
      version: "1.0.0",
      title: "Bad — composer.name LIKE",
      description: "Should be rejected.",
      parameters: [{ name: "patient_id", type: "string", required: true, description: "" }],
      output: { columns: [] },
      metadata: { tier: "honest", category: "data-query", intent: "test" },
      aql: `SELECT e/ehr_id/value FROM EHR e CONTAINS COMPOSITION c WHERE c/composer/name LIKE '*HBA1C*'`,
    };
    expect(() => validateTemplate(bad)).toThrow(RegistryValidationError);
    try {
      validateTemplate(bad);
    } catch (err) {
      if (err instanceof RegistryValidationError) expect(err.reason).toBe("composer_name_like");
    }
  });

  it("AC7-S4 — rejects template without archetype CONTAINS nor template_id filter", () => {
    const bad: TemplateDefinition = {
      id: "se.nimloth.aql.bad_no_archetype",
      version: "1.0.0",
      title: "Bad — no archetype discrimination",
      description: "Should be rejected.",
      parameters: [],
      output: { columns: [] },
      metadata: { tier: "honest", category: "data-query", intent: "test" },
      aql: `SELECT e/ehr_id/value FROM EHR e CONTAINS COMPOSITION c`,
    };
    expect(() => validateTemplate(bad)).toThrow(RegistryValidationError);
  });

  it("S3 — rejects proxy-tier templates", () => {
    const proxy: TemplateDefinition = {
      id: "se.nimloth.aql.proxy_fixture",
      version: "1.0.0",
      title: "Proxy",
      description: "",
      parameters: [],
      output: { columns: [] },
      metadata: { tier: "proxy" as "proxy", category: "data-query", intent: "test" },
      aql: `SELECT e/ehr_id/value FROM EHR e CONTAINS COMPOSITION c CONTAINS OBSERVATION o[openEHR-EHR-OBSERVATION.laboratory_test_result.v1]`,
    };
    expect(() => validateTemplate(proxy)).toThrow(RegistryValidationError);
    try {
      validateTemplate(proxy);
    } catch (err) {
      if (err instanceof RegistryValidationError) expect(err.reason).toBe("tier_not_honest");
    }
  });
});
