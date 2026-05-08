import { describe, expect, it } from 'vitest';
import {
  aggregate,
  DEFAULT_CONFIDENCE_THRESHOLD,
  type DeterministicResults,
  type LlmResults,
} from '../aggregator.js';
import type { MedicationNameValue, RouteValue, SubjectValue } from '../../types/review.js';
import type { MappedField } from '../deterministic.js';
import type { LlmField, DosageQuantity, Frequency } from '../llm-assist.js';

// ----- Test fixtures ---------------------------------------------------

const detField = <T>(value: T): MappedField<T> => ({ value, confidence: 1.0 });

const llmField = <T>(value: T, confidence: number): LlmField<T> => ({
  value,
  confidence,
  reasoning: 'mock',
  attempts: 1,
});

const fullDeterministic = (): DeterministicResults => ({
  medicationName: detField<MedicationNameValue>({
    name: 'Warfarin',
    code: 'B01AA03',
    system: 'http://www.whocc.no/atc',
  }),
  status: detField('active'),
  startTime: detField('2025-03-18T08:00:00Z'),
  route: detField<RouteValue>({
    value: 'Oral',
    terminology: 'http://snomed.info/sct',
    code: '26643006',
  }),
  sequence: detField(1),
  subject: detField<SubjectValue>({
    namespace: 'patient',
    type: 'PERSON',
    id: '19500315-2384',
  }),
});

const fullLlm = (confidence = 0.95): LlmResults => ({
  doseQuantity: llmField<DosageQuantity>(
    { value: 2.5, unit: 'mg', confidence, reasoning: 'mock' },
    confidence,
  ),
  frequency: llmField<Frequency>(
    { code: 'DAILY', confidence, reasoning: 'mock' },
    confidence,
  ),
});

const emptyDeterministic = (): DeterministicResults => ({
  medicationName: null,
  status: null,
  startTime: null,
  route: null,
  sequence: null,
  subject: null,
});

// ----- Tester ----------------------------------------------------------

describe('aggregate', () => {
  it('returnerar status=complete när alla deterministiska fält finns + LLM ≥ threshold', () => {
    const result = aggregate(fullDeterministic(), fullLlm(), 'med-001');
    expect(result.status).toBe('complete');
    expect(result.reviewPayload).toBeNull();
    expect(result.composition.medicationName?.value.code).toBe('B01AA03');
    expect(result.composition.frequency?.value).toBe('DAILY');
    expect(result.composition.doseQuantity?.value.value).toBe(2.5);
  });

  it('triggar missing_required_field när medicationName saknas', () => {
    const det = fullDeterministic();
    det.medicationName = null;
    const result = aggregate(det, fullLlm(), 'med-X');
    expect(result.status).toBe('human-review-required');
    expect(result.reviewPayload?.triggerReason).toBe('missing_required_field');
  });

  it('triggar missing_required_field när status saknas (deterministic + LLM null)', () => {
    const det = fullDeterministic();
    det.status = null;
    const result = aggregate(det, fullLlm(), 'med-X');
    expect(result.status).toBe('human-review-required');
    expect(result.reviewPayload?.triggerReason).toBe('missing_required_field');
  });

  it('triggar missing_required_field när subject saknas', () => {
    const det = fullDeterministic();
    det.subject = null;
    const result = aggregate(det, fullLlm(), 'med-X');
    expect(result.status).toBe('human-review-required');
    expect(result.reviewPayload?.triggerReason).toBe('missing_required_field');
  });

  it('triggar low_confidence när aggregat-confidence < threshold', () => {
    // LLM-fält med low confidence drar ned aggregatet
    const lowLlm: LlmResults = {
      doseQuantity: llmField<DosageQuantity>(
        { value: 5, unit: 'mg', confidence: 0.4, reasoning: 'osäker' },
        0.4,
      ),
      frequency: llmField<Frequency>({ code: 'DAILY', confidence: 0.4, reasoning: 'mock' }, 0.4),
    };
    const result = aggregate(fullDeterministic(), lowLlm, 'med-X', 0.7);
    expect(result.status).toBe('human-review-required');
    expect(result.reviewPayload?.triggerReason).toBe('low_confidence');
    expect(result.aggregateConfidence).toBe(0.4);
  });

  it('triggar conflicting_evidence när deterministic och LLM ATC ger olika koder', () => {
    const det = fullDeterministic();
    // LLM föreslår annan ATC-kod
    const llm: LlmResults = {
      ...fullLlm(),
      atc: llmField<{ code: string | null; display: string | null }>(
        { code: 'C09AA05', display: 'Ramipril' },
        0.9,
      ),
    };
    const result = aggregate(det, llm, 'med-X');
    expect(result.status).toBe('human-review-required');
    expect(result.reviewPayload?.triggerReason).toBe('conflicting_evidence');
    // Deterministic vinner i composition trots conflict
    expect(result.composition.medicationName?.value.code).toBe('B01AA03');
  });

  it('passes vid threshold-edge — confidence exakt 0.7 ska bli complete', () => {
    const llm: LlmResults = {
      doseQuantity: llmField<DosageQuantity>(
        { value: 5, unit: 'mg', confidence: 0.7, reasoning: 'gränsfall' },
        0.7,
      ),
      frequency: llmField<Frequency>({ code: 'DAILY', confidence: 0.7, reasoning: 'mock' }, 0.7),
    };
    const result = aggregate(fullDeterministic(), llm, 'med-X', 0.7);
    expect(result.status).toBe('complete');
    expect(result.aggregateConfidence).toBe(0.7);
  });

  it('justerad threshold=0.5 låter normalt low-confidence-fall passera', () => {
    const llm: LlmResults = {
      doseQuantity: llmField<DosageQuantity>(
        { value: 5, unit: 'mg', confidence: 0.6, reasoning: 'mock' },
        0.6,
      ),
      frequency: llmField<Frequency>({ code: 'DAILY', confidence: 0.6, reasoning: 'mock' }, 0.6),
    };
    const result = aggregate(fullDeterministic(), llm, 'med-X', 0.5);
    expect(result.status).toBe('complete');
  });

  it('helt tom input → review_required (alla fields unknown, missing_required)', () => {
    const result = aggregate(emptyDeterministic(), {}, 'med-X');
    expect(result.status).toBe('human-review-required');
    expect(result.reviewPayload?.triggerReason).toBe('missing_required_field');
    // FieldEvidence ska ha rader för alla 9 fält trots tom input
    expect(result.fieldEvidence.length).toBe(9);
    expect(result.fieldEvidence.every((e) => e.source === 'unknown')).toBe(true);
  });

  it('LLM-status fyller i när deterministic-status är null + complete vid hög LLM-confidence', () => {
    const det = fullDeterministic();
    det.status = null;
    const llm: LlmResults = {
      ...fullLlm(),
      status: llmField(
        { status: 'completed' as const, confidence: 0.9, reasoning: 'avslut' },
        0.9,
      ),
    };
    const result = aggregate(det, llm, 'med-X');
    expect(result.status).toBe('complete');
    expect(result.composition.status?.value).toBe('completed');
    const ev = result.fieldEvidence.find((e) => e.fieldName === 'status');
    expect(ev?.source).toBe('llm');
  });

  it('fieldEvidence har 9 rader (en per ExpectedFields-fält)', () => {
    const result = aggregate(fullDeterministic(), fullLlm(), 'med-001');
    expect(result.fieldEvidence.length).toBe(9);
    const fieldNames = result.fieldEvidence.map((e) => e.fieldName);
    for (const required of ['medicationName', 'status', 'subject', 'doseQuantity', 'frequency'] as const) {
      expect(fieldNames).toContain(required);
    }
  });

  it('reviewPayload.timestamp är giltig ISO 8601', () => {
    const det = fullDeterministic();
    det.medicationName = null;
    const result = aggregate(det, fullLlm(), 'med-X');
    expect(result.reviewPayload?.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('default threshold är 0.7', () => {
    expect(DEFAULT_CONFIDENCE_THRESHOLD).toBe(0.7);
  });

  it('LLM-ATC fyller medicationName när deterministic är null', () => {
    const det = fullDeterministic();
    det.medicationName = null;
    const llm: LlmResults = {
      ...fullLlm(),
      atc: llmField<{ code: string | null; display: string | null }>(
        { code: 'B01AA03', display: 'Warfarin' },
        0.9,
      ),
    };
    const result = aggregate(det, llm, 'med-X');
    expect(result.composition.medicationName?.value).toEqual({
      name: 'Warfarin',
      code: 'B01AA03',
      system: 'http://www.whocc.no/atc',
    });
    const ev = result.fieldEvidence.find((e) => e.fieldName === 'medicationName');
    expect(ev?.source).toBe('llm');
  });

  it('triggar conflicting_evidence när deterministic.status ≠ LLM.status', () => {
    const det = fullDeterministic();
    // deterministic säger 'active'
    const llm: LlmResults = {
      ...fullLlm(),
      status: llmField(
        { status: 'completed' as const, confidence: 0.9, reasoning: 'olika' },
        0.9,
      ),
    };
    const result = aggregate(det, llm, 'med-X');
    expect(result.status).toBe('human-review-required');
    expect(result.reviewPayload?.triggerReason).toBe('conflicting_evidence');
    // Deterministic vinner i composition
    expect(result.composition.status?.value).toBe('active');
  });
});
