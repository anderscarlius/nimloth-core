#!/usr/bin/env node
// eval-runner (P4 4.8) — kör composition-mapper mot eval-set:s 50 par
// och rapporterar field-accuracy + review-recall + per-complexity-
// breakdown. Körs via `pnpm eval` eller `pnpm eval:deterministic`.
//
// Ingen LLM-anslutning krävs när --pathway=deterministic. LLM-pathway
// (default) kräver att model-router och Hemmabasen-ollama är igång —
// 4.9-iteration mäter mot riktig modell.

import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pino from 'pino';
import { ModelRouter, loadRouterConfig } from '@nimloth-core/model-router';
import { mapMedicationStatement } from '../mapping/index.js';
import { LlmAssist } from '../mapping/llm-assist.js';
import { computeFieldAccuracy } from './accuracy.js';
import type { ExpectedFields } from '../types/review.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ============================================================
// Types
// ============================================================

export type Pathway = 'deterministic' | 'llm' | 'all';
export type Complexity = 'simple' | 'moderate' | 'complex';

export interface EvalArgs {
  pathway: Pathway;
  outputDir: string;
  threshold: number;
  evalSetDir?: string; // override för tester
  routerConfigPath?: string; // bara relevant för llm/all
}

interface EvalSetPair {
  id: string;
  metadata: { complexity: Complexity; expected_review: boolean; notes?: string };
  input_fhir: unknown;
  expected_fields: ExpectedFields;
}

export interface PerPairResult {
  pairId: string;
  complexity: Complexity;
  expectedReview: boolean;
  actualReview: boolean;
  fieldAccuracy: number;
  fieldCorrect: number;
  fieldTotal: number;
  perField: Record<string, boolean>;
  elapsedMs: number;
  aggregateConfidence: number;
}

export interface EvalReport {
  timestamp: string;
  pathway: Pathway;
  threshold: number;
  totalPairs: number;
  fieldAccuracy: number;
  reviewRecall: number;
  falsePositiveReviewRate: number;
  byComplexity: Record<Complexity, { count: number; fieldAccuracy: number; reviewRecall: number }>;
  byField: Record<string, { correct: number; total: number; accuracy: number }>;
  failures: Array<{ pairId: string; complexity: Complexity; missingOrWrong: string[] }>;
  meanElapsedMs: number;
  p95ElapsedMs: number;
}

// ============================================================
// Runner
// ============================================================

export async function runEval(args: EvalArgs): Promise<EvalReport> {
  const evalSetDir =
    args.evalSetDir ?? join(__dirname, '..', '..', 'eval-set');
  const files = readdirSync(evalSetDir)
    .filter((f) => /^med-\d{3}\.json$/.test(f))
    .sort();

  const logger = pino({ level: 'silent' });
  let llm: LlmAssist | undefined;

  if (args.pathway !== 'deterministic') {
    const cfgPath =
      args.routerConfigPath ?? join(__dirname, '..', '..', '..', '..', 'config', 'model-routing.yaml');
    const routerConfig = loadRouterConfig(cfgPath);
    const router = new ModelRouter(routerConfig);
    llm = new LlmAssist({ router, logger });
  }

  const results: PerPairResult[] = [];

  for (const file of files) {
    const raw = readFileSync(join(evalSetDir, file), 'utf-8');
    const pair = JSON.parse(raw) as EvalSetPair;
    const t0 = Date.now();

    const result = await mapMedicationStatement(
      pair.input_fhir as Parameters<typeof mapMedicationStatement>[0],
      pair.id,
      llm ? { llm } : {},
      {
        useLlm: args.pathway !== 'deterministic',
        threshold: args.threshold,
      },
    );

    const elapsedMs = Date.now() - t0;
    const acc = computeFieldAccuracy(result.composition, pair.expected_fields);

    results.push({
      pairId: pair.id,
      complexity: pair.metadata.complexity,
      expectedReview: pair.metadata.expected_review,
      actualReview: result.status === 'human-review-required',
      fieldAccuracy: acc.accuracy,
      fieldCorrect: acc.correct,
      fieldTotal: acc.total,
      perField: acc.perField,
      elapsedMs,
      aggregateConfidence: result.aggregateConfidence,
    });
  }

  return generateReport(results, args);
}

// ============================================================
// Report-generering
// ============================================================

export function generateReport(
  results: PerPairResult[],
  args: EvalArgs,
): EvalReport {
  const totalCorrect = results.reduce((s, r) => s + r.fieldCorrect, 0);
  const totalTotal = results.reduce((s, r) => s + r.fieldTotal, 0);
  const fieldAccuracy = totalTotal === 0 ? 0 : totalCorrect / totalTotal;

  // Review-recall = detected / expected
  const expectedReviewCount = results.filter((r) => r.expectedReview).length;
  const detectedReviewCount = results.filter((r) => r.expectedReview && r.actualReview).length;
  const reviewRecall = expectedReviewCount === 0 ? 0 : detectedReviewCount / expectedReviewCount;

  // FPR = unexpected_reviews / expected_completes
  const expectedCompleteCount = results.filter((r) => !r.expectedReview).length;
  const falsePositiveCount = results.filter((r) => !r.expectedReview && r.actualReview).length;
  const falsePositiveReviewRate =
    expectedCompleteCount === 0 ? 0 : falsePositiveCount / expectedCompleteCount;

  // Per-complexity
  const byComplexity: Record<Complexity, { count: number; fieldAccuracy: number; reviewRecall: number }> = {
    simple: aggregateComplexity(results, 'simple'),
    moderate: aggregateComplexity(results, 'moderate'),
    complex: aggregateComplexity(results, 'complex'),
  };

  // Per-field
  const fieldStats: Record<string, { correct: number; total: number }> = {};
  for (const r of results) {
    for (const [field, isMatch] of Object.entries(r.perField)) {
      if (!fieldStats[field]) fieldStats[field] = { correct: 0, total: 0 };
      fieldStats[field].total++;
      if (isMatch) fieldStats[field].correct++;
    }
  }
  const byField: Record<string, { correct: number; total: number; accuracy: number }> = {};
  for (const [field, stats] of Object.entries(fieldStats)) {
    byField[field] = {
      correct: stats.correct,
      total: stats.total,
      accuracy: stats.total === 0 ? 0 : stats.correct / stats.total,
    };
  }

  // Failures
  const failures = results
    .filter((r) => r.fieldAccuracy < 1.0)
    .map((r) => ({
      pairId: r.pairId,
      complexity: r.complexity,
      missingOrWrong: Object.entries(r.perField)
        .filter(([, isMatch]) => !isMatch)
        .map(([field]) => field),
    }));

  // Latency
  const elapsed = results.map((r) => r.elapsedMs).sort((a, b) => a - b);
  const meanElapsedMs =
    elapsed.length === 0 ? 0 : elapsed.reduce((s, x) => s + x, 0) / elapsed.length;
  const p95Index = Math.floor(elapsed.length * 0.95);
  const p95ElapsedMs = elapsed[p95Index] ?? 0;

  return {
    timestamp: new Date().toISOString(),
    pathway: args.pathway,
    threshold: args.threshold,
    totalPairs: results.length,
    fieldAccuracy,
    reviewRecall,
    falsePositiveReviewRate,
    byComplexity,
    byField,
    failures,
    meanElapsedMs,
    p95ElapsedMs,
  };
}

function aggregateComplexity(
  results: PerPairResult[],
  complexity: Complexity,
): { count: number; fieldAccuracy: number; reviewRecall: number } {
  const subset = results.filter((r) => r.complexity === complexity);
  if (subset.length === 0) {
    return { count: 0, fieldAccuracy: 0, reviewRecall: 0 };
  }
  const correct = subset.reduce((s, r) => s + r.fieldCorrect, 0);
  const total = subset.reduce((s, r) => s + r.fieldTotal, 0);
  const expRev = subset.filter((r) => r.expectedReview);
  const detRev = expRev.filter((r) => r.actualReview);
  return {
    count: subset.length,
    fieldAccuracy: total === 0 ? 0 : correct / total,
    reviewRecall: expRev.length === 0 ? 0 : detRev.length / expRev.length,
  };
}

// ============================================================
// CLI
// ============================================================

export function parseArgs(argv: string[]): EvalArgs {
  let pathway: Pathway = 'all';
  let threshold = 0.7;
  for (const arg of argv) {
    if (arg.startsWith('--pathway=')) {
      const value = arg.slice('--pathway='.length);
      if (value === 'deterministic' || value === 'llm' || value === 'all') {
        pathway = value;
      }
    } else if (arg.startsWith('--threshold=')) {
      threshold = parseFloat(arg.slice('--threshold='.length));
    }
  }
  return {
    pathway,
    threshold,
    outputDir: join(__dirname, '..', '..', 'eval-set', 'reports'),
  };
}

function reportFilename(args: EvalArgs): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${stamp}-${args.pathway}.json`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  // eslint-disable-next-line no-console
  console.log(`eval-runner: pathway=${args.pathway}, threshold=${args.threshold}`);
  const report = await runEval(args);

  if (!existsSync(args.outputDir)) mkdirSync(args.outputDir, { recursive: true });
  const outFile = join(args.outputDir, reportFilename(args));
  writeFileSync(outFile, JSON.stringify(report, null, 2));

  // Sammanfattning till stdout
  // eslint-disable-next-line no-console
  console.log(`
Pairs: ${report.totalPairs}
Field accuracy: ${(report.fieldAccuracy * 100).toFixed(1)}%
Review recall: ${(report.reviewRecall * 100).toFixed(1)}%
False-positive review rate: ${(report.falsePositiveReviewRate * 100).toFixed(1)}%
Mean latency: ${report.meanElapsedMs.toFixed(0)}ms
P95 latency: ${report.p95ElapsedMs.toFixed(0)}ms

Per complexity:
  simple:   ${report.byComplexity.simple.count} pairs, accuracy ${(report.byComplexity.simple.fieldAccuracy * 100).toFixed(1)}%, review-recall ${(report.byComplexity.simple.reviewRecall * 100).toFixed(1)}%
  moderate: ${report.byComplexity.moderate.count} pairs, accuracy ${(report.byComplexity.moderate.fieldAccuracy * 100).toFixed(1)}%, review-recall ${(report.byComplexity.moderate.reviewRecall * 100).toFixed(1)}%
  complex:  ${report.byComplexity.complex.count} pairs, accuracy ${(report.byComplexity.complex.fieldAccuracy * 100).toFixed(1)}%, review-recall ${(report.byComplexity.complex.reviewRecall * 100).toFixed(1)}%

Report: ${outFile}
`);
}

// Bara kör main när skriptet körs direkt (inte vid import från tester)
const isMain =
  import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url.endsWith(process.argv[1] ?? '');
if (isMain) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('eval-runner crashed:', err);
    process.exit(1);
  });
}
