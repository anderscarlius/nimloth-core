// PATCH B — annotation-kontrakt: unit + 50-patient genererings-smoke.

import { describe, expect, it } from "vitest";
import {
  ANNOTATION_CONTRACT,
  assertAnnotation,
  AnnotationContractError,
} from "../engine/annotation-contract.js";
import { generateTimelines } from "../engine/TimelineGenerator.js";

describe("annotation-contract (unit)", () => {
  it("accepts well-formed TYPE | CODE | DESC", () => {
    expect(() => assertAnnotation("lab_result | HBA1C | 54 mmol/mol")).not.toThrow();
    expect(() => assertAnnotation("problem_diagnosis | diabetes_typ2 | severity=mild")).not.toThrow();
    expect(() => assertAnnotation("medication_statement | A10BA02 | Metformin 500 mg")).not.toThrow();
  });

  it("rejects free-form (no pipes)", () => {
    expect(() => assertAnnotation("complications, see notes")).toThrow(AnnotationContractError);
  });

  it("rejects missing description segment", () => {
    expect(() => assertAnnotation("lab_result | HBA1C")).toThrow(AnnotationContractError);
    expect(() => assertAnnotation("lab_result | HBA1C | ")).toThrow(AnnotationContractError);
  });

  it("rejects empty code segment", () => {
    expect(() => assertAnnotation("lab_result |  | value")).toThrow(AnnotationContractError);
  });

  it("rejects code with spaces (would corrupt structured field)", () => {
    // Bespoke anchor-form 'E11 diabetes_typ2' is NOT engine output and must
    // not slip through the engine path.
    expect(() => assertAnnotation("problem_diagnosis | E11 diabetes_typ2 | x")).toThrow(AnnotationContractError);
  });

  it("regex is exported and consistent with assert", () => {
    expect(ANNOTATION_CONTRACT.test("a | b | c")).toBe(true);
    expect(ANNOTATION_CONTRACT.test("bad")).toBe(false);
  });
});

describe("annotation-contract (50-patient generation smoke)", () => {
  // Generera realistisk delpopulation över profiler. Om någon engine-genererad
  // annotation bryter kontraktet kastar generateTimelines → testet failar loud.
  const BATCHES = [
    { profileId: "diabetes_typ2", count: 15, seed: 8100 },
    { profileId: "hypertoni", count: 10, seed: 8200 },
    { profileId: "aldre_multisjuk", count: 15, seed: 8300 },
    { profileId: "uvi", count: 10, seed: 8600 },
  ];

  it("no malformed annotation across 50 generated patients", () => {
    let annotationCount = 0;
    for (const b of BATCHES) {
      const timelines = generateTimelines(b);
      for (const tl of timelines) {
        for (const ev of tl.events) {
          // generateTimelines already validated; re-assert for explicit coverage.
          expect(() => assertAnnotation(ev.clinicalData.annotation, ev.eventType)).not.toThrow();
          annotationCount++;
        }
      }
    }
    expect(annotationCount).toBeGreaterThan(200);
  });
});
