import { describe, expect, it } from "vitest";
import { bindParams, validateAndApplyDefaults, ParameterBindError } from "../param-binder.js";

describe("param-binder", () => {
  it("applies defaults for non-required params", () => {
    const specs = [
      { name: "patient_id", type: "string" as const, required: true, description: "" },
      { name: "threshold", type: "number" as const, required: false, default: 70, description: "" },
    ];
    const bound = validateAndApplyDefaults(specs, { patient_id: "lars-johansson-syn-001" });
    expect(bound).toEqual({ patient_id: "lars-johansson-syn-001", threshold: 70 });
  });

  it("rejects missing required param", () => {
    const specs = [{ name: "patient_id", type: "string" as const, required: true, description: "" }];
    expect(() => validateAndApplyDefaults(specs, {})).toThrow(ParameterBindError);
  });

  it("rejects unknown params (strict mode)", () => {
    const specs = [{ name: "patient_id", type: "string" as const, required: true, description: "" }];
    expect(() => validateAndApplyDefaults(specs, { patient_id: "x", typo: "y" })).toThrow(ParameterBindError);
  });

  it("rejects non-numeric number param", () => {
    const specs = [{ name: "n", type: "number" as const, required: true, description: "" }];
    expect(() => validateAndApplyDefaults(specs, { n: "abc" })).toThrow(ParameterBindError);
  });

  it("rejects malformed date param", () => {
    const specs = [{ name: "from_date", type: "date" as const, required: true, description: "" }];
    expect(() => validateAndApplyDefaults(specs, { from_date: "yesterday" })).toThrow(ParameterBindError);
    expect(validateAndApplyDefaults(specs, { from_date: "2025-01-15" })).toEqual({ from_date: "2025-01-15" });
  });

  it("escapes single quotes in string substitution", () => {
    const out = bindParams("WHERE x = :v", { v: "O'Brien" });
    expect(out).toBe("WHERE x = 'O''Brien'");
  });

  it("inlines numbers without quotes", () => {
    const out = bindParams("WHERE m > :threshold", { threshold: 70 });
    expect(out).toBe("WHERE m > 70");
  });
});
