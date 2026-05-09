import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateReport, parseArgs, runEval, type PerPairResult } from '../runner.js';

describe('generateReport', () => {
  const baseArgs = {
    pathway: 'deterministic' as const,
    threshold: 0.7,
    outputDir: '/tmp',
  };

  it('beräknar overall field-accuracy som summed-correct / summed-total', () => {
    const results: PerPairResult[] = [
      makePerPair({ pairId: 'a', fieldCorrect: 8, fieldTotal: 8 }),
      makePerPair({ pairId: 'b', fieldCorrect: 4, fieldTotal: 8 }),
    ];
    const report = generateReport(results, baseArgs);
    expect(report.fieldAccuracy).toBeCloseTo(12 / 16, 3);
  });

  it('beräknar review-recall = detected/expected', () => {
    const results: PerPairResult[] = [
      makePerPair({ pairId: 'a', expectedReview: true, actualReview: true }),
      makePerPair({ pairId: 'b', expectedReview: true, actualReview: false }),
      makePerPair({ pairId: 'c', expectedReview: false, actualReview: false }),
    ];
    const report = generateReport(results, baseArgs);
    expect(report.reviewRecall).toBeCloseTo(0.5, 3);
  });

  it('beräknar false-positive-review-rate', () => {
    const results: PerPairResult[] = [
      makePerPair({ pairId: 'a', expectedReview: false, actualReview: true }),
      makePerPair({ pairId: 'b', expectedReview: false, actualReview: false }),
      makePerPair({ pairId: 'c', expectedReview: true, actualReview: true }),
    ];
    const report = generateReport(results, baseArgs);
    expect(report.falsePositiveReviewRate).toBeCloseTo(0.5, 3);
  });

  it('per-complexity-breakdown', () => {
    const results: PerPairResult[] = [
      makePerPair({ pairId: 's1', complexity: 'simple', fieldCorrect: 8, fieldTotal: 8 }),
      makePerPair({ pairId: 's2', complexity: 'simple', fieldCorrect: 7, fieldTotal: 8 }),
      makePerPair({ pairId: 'm1', complexity: 'moderate', fieldCorrect: 4, fieldTotal: 8 }),
      makePerPair({ pairId: 'c1', complexity: 'complex', fieldCorrect: 2, fieldTotal: 8 }),
    ];
    const report = generateReport(results, baseArgs);
    expect(report.byComplexity.simple.count).toBe(2);
    expect(report.byComplexity.simple.fieldAccuracy).toBeCloseTo(15 / 16, 3);
    expect(report.byComplexity.moderate.count).toBe(1);
    expect(report.byComplexity.complex.count).toBe(1);
  });

  it('per-field-breakdown ackumulerar over results', () => {
    const results: PerPairResult[] = [
      makePerPair({
        pairId: 'a',
        perField: { medicationName: true, status: true, doseQuantity: false },
      }),
      makePerPair({
        pairId: 'b',
        perField: { medicationName: true, status: false, doseQuantity: false },
      }),
    ];
    const report = generateReport(results, baseArgs);
    expect(report.byField.medicationName).toEqual({ correct: 2, total: 2, accuracy: 1.0 });
    expect(report.byField.status).toEqual({ correct: 1, total: 2, accuracy: 0.5 });
    expect(report.byField.doseQuantity).toEqual({ correct: 0, total: 2, accuracy: 0 });
  });

  it('failures-list innehåller bara pairs med <100% accuracy', () => {
    const results: PerPairResult[] = [
      makePerPair({ pairId: 'a', fieldAccuracy: 1.0 }),
      makePerPair({
        pairId: 'b',
        fieldAccuracy: 0.5,
        perField: { medicationName: true, status: false },
      }),
    ];
    const report = generateReport(results, baseArgs);
    expect(report.failures).toHaveLength(1);
    expect(report.failures[0]?.pairId).toBe('b');
    expect(report.failures[0]?.missingOrWrong).toContain('status');
  });

  it('latency-statistik (mean + p95)', () => {
    const results: PerPairResult[] = Array.from({ length: 20 }, (_, i) =>
      makePerPair({ pairId: `p${i}`, elapsedMs: (i + 1) * 10 }),
    );
    const report = generateReport(results, baseArgs);
    expect(report.meanElapsedMs).toBeCloseTo(105, 1);
    // 95:e percentilen av 10..200 i steg 10 = index Math.floor(20*0.95)=19 → 200ms
    expect(report.p95ElapsedMs).toBe(200);
  });

  it('rapporten dokumenterar dataMode=synthetic (B22.5)', () => {
    // Eval-set:s 50 par är syntetisk testdata. Rapporten ska explicit visa
    // att resultaten kommer från cloud-routing av syntetisk data — inte PHI.
    // Pålitligt fält att referera till i CIO-granskning av eval-rapporter.
    const report = generateReport([makePerPair({ pairId: 'a' })], baseArgs);
    expect(report.dataMode).toBe('synthetic');
  });
});

describe('runEval (mot mini eval-set)', () => {
  let evalSetDir: string;

  beforeEach(() => {
    evalSetDir = mkdtempSync(join(tmpdir(), 'eval-set-'));
    // Skapa ett trivialt par som 4.3-deterministic kan hantera fullt
    const pair = {
      id: 'med-mini-001',
      metadata: { complexity: 'simple', expected_review: false },
      input_fhir: {
        resourceType: 'MedicationStatement',
        status: 'active',
        medicationCodeableConcept: {
          coding: [{ system: 'http://www.whocc.no/atc', code: 'B01AA03', display: 'Warfarin' }],
        },
        subject: { reference: 'Patient/test-1' },
        effectiveDateTime: '2025-03-18T08:00:00Z',
      },
      expected_fields: {
        medicationName: {
          value: { name: 'Warfarin', code: 'B01AA03', system: 'http://www.whocc.no/atc' },
        },
        status: { value: 'active' },
        startTime: { value: '2025-03-18T08:00:00Z' },
        route: null,
        sequence: null,
        subject: { value: { namespace: 'patient', type: 'PERSON', id: 'test-1' } },
        doseQuantity: null,
        frequency: null,
        indication: null,
      },
    };
    writeFileSync(join(evalSetDir, 'med-001.json'), JSON.stringify(pair));
  });

  it('kör deterministic-pathway mot mini-set och producerar rapport', async () => {
    const report = await runEval({
      pathway: 'deterministic',
      threshold: 0.7,
      outputDir: '/tmp',
      evalSetDir,
    });
    expect(report.totalPairs).toBe(1);
    // 4 non-null expected fields → 4/4 om deterministic-mappning lyckas
    expect(report.fieldAccuracy).toBe(1.0);
    expect(report.byComplexity.simple.count).toBe(1);
    expect(report.failures).toHaveLength(0);
  });
});

describe('parseArgs', () => {
  it('default-värden när inga args', () => {
    const args = parseArgs([]);
    expect(args.pathway).toBe('all');
    expect(args.threshold).toBe(0.7);
  });

  it('--pathway=deterministic', () => {
    const args = parseArgs(['--pathway=deterministic']);
    expect(args.pathway).toBe('deterministic');
  });

  it('--pathway=llm', () => {
    const args = parseArgs(['--pathway=llm']);
    expect(args.pathway).toBe('llm');
  });

  it('--pathway=invalid → default behållen', () => {
    const args = parseArgs(['--pathway=invalid']);
    expect(args.pathway).toBe('all');
  });

  it('--threshold=0.5 parses', () => {
    const args = parseArgs(['--threshold=0.5']);
    expect(args.threshold).toBe(0.5);
  });
});

// ----- Helpers ---------------------------------------------------

function makePerPair(over: Partial<PerPairResult> = {}): PerPairResult {
  return {
    pairId: 'p',
    complexity: 'simple',
    expectedReview: false,
    actualReview: false,
    fieldAccuracy: 1.0,
    fieldCorrect: 8,
    fieldTotal: 8,
    perField: {},
    elapsedMs: 5,
    aggregateConfidence: 1.0,
    ...over,
  };
}
