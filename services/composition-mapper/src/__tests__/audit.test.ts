import { describe, it, expect, beforeEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import pino from 'pino';
import { CompositionMapperDb } from '../db.js';
import { AuditPublisher } from '../audit-publisher.js';
import {
  buildMappingAuditEvent,
  emitMappingAudit,
  buildAndEmit,
} from '../audit.js';
import type { MedicationStatement } from '../validation/fhir.js';
import type { AggregationResult, FieldEvidence } from '../types/review.js';

const silentLogger = pino({ level: 'silent' });

const baseMs: MedicationStatement = {
  resourceType: 'MedicationStatement',
  status: 'active',
  medicationCodeableConcept: {
    coding: [{ system: 'http://www.whocc.no/atc', code: 'B01AA03', display: 'Warfarin' }],
  },
  subject: { reference: 'Patient/19500315-2384' },
};

const completeResult = (): AggregationResult => {
  const fe: FieldEvidence[] = [
    { fieldName: 'medicationName', source: 'deterministic', value: 'x', confidence: 1.0 },
    { fieldName: 'status', source: 'deterministic', value: 'active', confidence: 1.0 },
    { fieldName: 'subject', source: 'deterministic', value: 'p', confidence: 1.0 },
    { fieldName: 'doseQuantity', source: 'llm', value: 'd', confidence: 0.9, attempts: 1 },
  ];
  return {
    status: 'complete',
    composition: {},
    reviewPayload: null,
    fieldEvidence: fe,
    aggregateConfidence: 0.9,
  };
};

const reviewResult = (): AggregationResult => {
  const fe: FieldEvidence[] = [
    { fieldName: 'medicationName', source: 'deterministic', value: 'x', confidence: 1.0 },
    { fieldName: 'status', source: 'unknown', value: null, confidence: 0 },
    { fieldName: 'subject', source: 'deterministic', value: 'p', confidence: 1.0 },
  ];
  return {
    status: 'human-review-required',
    composition: {},
    reviewPayload: {
      inputId: 'med-X',
      triggerReason: 'missing_required_field',
      aggregateConfidence: 0.5,
      fields: fe,
      proposedComposition: {},
      timestamp: new Date().toISOString(),
    },
    fieldEvidence: fe,
    aggregateConfidence: 0.5,
  };
};

// ============================================================
// buildMappingAuditEvent
// ============================================================

describe('buildMappingAuditEvent', () => {
  it('producerar MAPPING_COMPOSE-event med SUCCESS-outcome för complete-result', () => {
    const event = buildMappingAuditEvent(baseMs, 'med-001', completeResult());
    expect(event.action).toBe('MAPPING_COMPOSE');
    expect(event.outcome).toBe('SUCCESS');
    expect(event.resourceType).toBe('MedicationStatement');
    expect(event.resourceId).toBe('med-001');
    expect(event.patientId).toBe('19500315-2384');
    expect(event.actor.hsaId).toBe('system:composition-mapper');
    expect(event.actor.role).toBe('system');
  });

  it('producerar MAPPING_REVIEW_REQUIRED-event med REVIEW-outcome', () => {
    const event = buildMappingAuditEvent(baseMs, 'med-X', reviewResult());
    expect(event.action).toBe('MAPPING_REVIEW_REQUIRED');
    expect(event.outcome).toBe('REVIEW');
    expect(event.details.triggerReason).toBe('missing_required_field');
  });

  it('inkluderar field-counts (deterministic + llm)', () => {
    const event = buildMappingAuditEvent(baseMs, 'med-001', completeResult());
    expect(event.details.fieldEvidenceCount).toBe(4);
    expect(event.details.deterministicFieldCount).toBe(3);
    expect(event.details.llmFieldCount).toBe(1);
  });

  it('inkluderar promptHashes när options ger dem', () => {
    const event = buildMappingAuditEvent(baseMs, 'med-001', completeResult(), {
      promptHashes: ['abc123', 'def456'],
    });
    expect(event.details.promptHashes).toEqual(['abc123', 'def456']);
  });

  it('utelämnar promptHashes-fältet helt om listan är tom (ingen LLM-användning)', () => {
    const event = buildMappingAuditEvent(baseMs, 'med-001', completeResult());
    expect(event.details.promptHashes).toBeUndefined();
  });

  it('eventId är giltig UUID v4', () => {
    const event = buildMappingAuditEvent(baseMs, 'med-001', completeResult());
    expect(event.eventId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('timestamp är giltig ISO 8601', () => {
    const event = buildMappingAuditEvent(baseMs, 'med-001', completeResult());
    expect(event.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('extracts patientId=null när reference är malformed', () => {
    const malformedMs: MedicationStatement = {
      ...baseMs,
      subject: { reference: 'Patient/' },
    };
    const event = buildMappingAuditEvent(malformedMs, 'med-001', completeResult());
    expect(event.patientId).toBeNull();
  });
});

// ============================================================
// emitMappingAudit + buildAndEmit (mot real SQLite-outbox)
// ============================================================

describe('emitMappingAudit (mot SQLite-outbox)', () => {
  let dbPath: string;
  let tempDir: string;
  let db: CompositionMapperDb;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'cm-audit-test-'));
    dbPath = join(tempDir, 'test.sqlite');
    db = new CompositionMapperDb(dbPath);
    db.migrate(
      join(__dirname, '..', '..', 'migrations'),
      silentLogger,
    );
  });

  it('skriver event till outbox via emitMappingAudit', () => {
    const event = buildMappingAuditEvent(baseMs, 'med-001', completeResult());
    emitMappingAudit({ db }, event);
    const stats = db.outboxStats();
    expect(stats.pending).toBe(1);
    expect(stats.published).toBe(0);
  });

  it('buildAndEmit returnerar event och skriver till outbox i ett anrop', () => {
    const event = buildAndEmit({ db }, baseMs, 'med-002', completeResult());
    expect(event.resourceId).toBe('med-002');
    const pending = db.pendingAudit(10);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.event_id).toBe(event.eventId);
    expect(pending[0]?.event_type).toBe('MAPPING_COMPOSE');
  });

  it('REVIEW-event lagras med rätt event_type', () => {
    const event = buildAndEmit({ db }, baseMs, 'med-X', reviewResult());
    expect(event.action).toBe('MAPPING_REVIEW_REQUIRED');
    const pending = db.pendingAudit(10);
    expect(pending[0]?.event_type).toBe('MAPPING_REVIEW_REQUIRED');
  });

  it('flera events ackumuleras i outbox utan kollision', () => {
    buildAndEmit({ db }, baseMs, 'med-001', completeResult());
    buildAndEmit({ db }, baseMs, 'med-002', completeResult());
    buildAndEmit({ db }, baseMs, 'med-003', reviewResult());
    expect(db.outboxStats().pending).toBe(3);
  });
});

// ============================================================
// AuditPublisher lazy-connect-test (Spår A — utan Kafka)
// ============================================================

describe('AuditPublisher (lazy-connect)', () => {
  let dbPath: string;
  let tempDir: string;
  let db: CompositionMapperDb;
  let publisher: AuditPublisher;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'cm-pub-test-'));
    dbPath = join(tempDir, 'test.sqlite');
    db = new CompositionMapperDb(dbPath);
    db.migrate(join(__dirname, '..', '..', 'migrations'), silentLogger);
    publisher = new AuditPublisher(
      {
        brokers: ['localhost:9092'],
        clientId: 'composition-mapper-test',
        topic: 'core.audit.access',
        drainIntervalMs: 5000,
        batchSize: 50,
      },
      db,
      silentLogger,
    );
  });

  it('start() instantierar INTE Kafka-producer (lazy)', () => {
    publisher.start();
    expect(publisher.isConnected()).toBe(false);
    publisher.stop();
  });

  it('drain med tom outbox returnerar utan att connecta', async () => {
    const result = await publisher.drain();
    expect(result.drained).toBe(0);
    expect(result.pending).toBe(0);
    expect(publisher.isConnected()).toBe(false);
  });

  it('drain med pending events försöker connecta (failar utan Kafka, behåller events i outbox)', async () => {
    buildAndEmit({ db }, baseMs, 'med-001', completeResult());
    const result = await publisher.drain();
    // Connect failar mot localhost:9092 (ingen Kafka kör i CI/dev)
    expect(result.drained).toBe(0);
    expect(result.pending).toBe(1);
    expect(publisher.isConnected()).toBe(false);
    // Event ligger kvar i outbox för nästa drain
    expect(db.outboxStats().pending).toBe(1);
  }, 30_000); // 30s timeout — Kafka-connect har egna retries
});

// ============================================================
// AuditPublisher disabled-mode (B25 4.10.5)
// ============================================================

describe('AuditPublisher (disabled-mode, B25 4.10.5)', () => {
  let dbPath: string;
  let tempDir: string;
  let db: CompositionMapperDb;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'cm-disabled-'));
    dbPath = join(tempDir, 'test.sqlite');
    db = new CompositionMapperDb(dbPath);
    db.migrate(join(__dirname, '..', '..', 'migrations'), silentLogger);
  });

  it('isDisabled() returnerar true när brokers=["disabled"]', () => {
    const p = new AuditPublisher(
      {
        brokers: ['disabled'],
        clientId: 'x',
        topic: 'x',
        drainIntervalMs: 100,
        batchSize: 10,
      },
      db,
      silentLogger,
    );
    expect(p.isDisabled()).toBe(true);
  });

  it('isDisabled() returnerar true när brokers=[""] (KAFKA_BROKERS= i .env)', () => {
    const p = new AuditPublisher(
      {
        brokers: [''],
        clientId: 'x',
        topic: 'x',
        drainIntervalMs: 100,
        batchSize: 10,
      },
      db,
      silentLogger,
    );
    expect(p.isDisabled()).toBe(true);
  });

  it('isDisabled() returnerar false när brokers=["localhost:9092"]', () => {
    const p = new AuditPublisher(
      {
        brokers: ['localhost:9092'],
        clientId: 'x',
        topic: 'x',
        drainIntervalMs: 100,
        batchSize: 10,
      },
      db,
      silentLogger,
    );
    expect(p.isDisabled()).toBe(false);
  });

  it('drain i disabled-mode försöker INTE connecta även med pending events', async () => {
    const publisher = new AuditPublisher(
      {
        brokers: ['disabled'],
        clientId: 'x',
        topic: 'core.audit.access',
        drainIntervalMs: 100,
        batchSize: 10,
      },
      db,
      silentLogger,
    );
    buildAndEmit({ db }, baseMs, 'med-disabled-1', completeResult());
    publisher.start(); // disabled — registrerar ingen timer
    const result = await publisher.drain();
    expect(result.drained).toBe(0);
    expect(result.pending).toBe(1);
    expect(publisher.isConnected()).toBe(false);
    // Event ligger kvar i outbox — kan dräneras senare när Kafka aktiveras
    expect(db.outboxStats().pending).toBe(1);
  });

  it('status() rapporterar disabled: true i disabled-mode', () => {
    const publisher = new AuditPublisher(
      {
        brokers: ['disabled'],
        clientId: 'x',
        topic: 'x',
        drainIntervalMs: 100,
        batchSize: 10,
      },
      db,
      silentLogger,
    );
    const s = publisher.status();
    expect(s.disabled).toBe(true);
    expect(s.connected).toBe(false);
  });
});
