import { describe, expect, it, beforeEach } from 'vitest';
import path from 'node:path';
import pino from 'pino';
import { MappingAssistantDb } from '../db.js';

const MIGRATIONS = path.resolve(__dirname, '../../migrations');

function freshDb(): MappingAssistantDb {
  const db = new MappingAssistantDb(':memory:');
  db.migrate(MIGRATIONS, pino({ level: 'silent' }));
  return db;
}

describe('MappingAssistantDb — suggestions', () => {
  let db: MappingAssistantDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('insert + find', () => {
    const inserted = db.insertSuggestion({
      task: 'mapping.propose',
      source: 'flexlab.results',
      target: 'core.clinical.lab.result',
      prompt_hash: 'a'.repeat(64),
      template_name: 'propose-mapping',
      template_sha: 'b'.repeat(64),
      provider_id: 'mock',
      model_used: 'mock-default',
      data_residency: 'on-premise',
      input_tokens: 100,
      output_tokens: 200,
      latency_ms: 42,
      generated_text: 'mock code',
      review_notes: null,
      proposed_path: '/tmp/x.ts',
    });
    expect(inserted.status).toBe('pending');
    const fetched = db.findSuggestion(inserted.id);
    expect(fetched?.source).toBe('flexlab.results');
  });

  it('listSuggestions filter by status', () => {
    db.insertSuggestion({
      task: 'mapping.propose', source: 's1', target: 't1', prompt_hash: '1'.repeat(64),
      template_name: 'propose-mapping', template_sha: '2'.repeat(64), provider_id: 'mock',
      model_used: 'mock-default', data_residency: 'on-premise', input_tokens: 0, output_tokens: 0,
      latency_ms: 0, generated_text: '', review_notes: null, proposed_path: null,
    });
    const s2 = db.insertSuggestion({
      task: 'mapping.propose', source: 's2', target: 't2', prompt_hash: '3'.repeat(64),
      template_name: 'propose-mapping', template_sha: '4'.repeat(64), provider_id: 'mock',
      model_used: 'mock-default', data_residency: 'on-premise', input_tokens: 0, output_tokens: 0,
      latency_ms: 0, generated_text: '', review_notes: null, proposed_path: null,
    });
    db.updateSuggestionStatus({
      id: s2.id, status: 'approved', approver_hsa_id: 'SE2321...', approver_role: 'integration-admin', decision_reason: 'looks good',
    });
    expect(db.listSuggestions({ status: 'pending' }).length).toBe(1);
    expect(db.listSuggestions({ status: 'approved' }).length).toBe(1);
    expect(db.countSuggestions()).toEqual({ pending: 1, approved: 1, rejected: 0 });
  });

  it('updateSuggestionStatus är idempotent (tar inte effekt på redan-beslutade)', () => {
    const s = db.insertSuggestion({
      task: 'mapping.propose', source: 's', target: 't', prompt_hash: 'a'.repeat(64),
      template_name: 'propose-mapping', template_sha: 'b'.repeat(64), provider_id: 'mock',
      model_used: 'mock-default', data_residency: 'on-premise', input_tokens: 0, output_tokens: 0,
      latency_ms: 0, generated_text: '', review_notes: null, proposed_path: null,
    });
    db.updateSuggestionStatus({
      id: s.id, status: 'approved', approver_hsa_id: 'A', approver_role: 'admin', decision_reason: null,
    });
    db.updateSuggestionStatus({
      id: s.id, status: 'rejected', approver_hsa_id: 'B', approver_role: 'admin', decision_reason: 'flipping',
    });
    const r = db.findSuggestion(s.id);
    expect(r?.status).toBe('approved');
    expect(r?.approver_hsa_id).toBe('A');
  });
});

describe('MappingAssistantDb — audit_outbox', () => {
  let db: MappingAssistantDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('enqueue + drain ordning', () => {
    db.enqueueAudit({ event_type: 'llm_invoked', payload: { v: 1 } });
    db.enqueueAudit({ event_type: 'llm_invoked', payload: { v: 2 } });
    db.enqueueAudit({ event_type: 'llm_invoked', payload: { v: 3 } });
    expect(db.outboxStats()).toEqual({ pending: 3, published: 0 });

    const batch = db.pendingAudit(2);
    expect(batch.length).toBe(2);
    expect(JSON.parse(batch[0].payload).v).toBe(1);

    db.markAuditPublished([batch[0].id, batch[1].id]);
    expect(db.outboxStats()).toEqual({ pending: 1, published: 2 });
  });

  it('markAuditFailed bumpar attempts utan att radera', () => {
    db.enqueueAudit({ event_type: 'llm_invoked', payload: { v: 1 } });
    const [row] = db.pendingAudit(1);
    db.markAuditFailed(row.id, 'broker down');
    const [again] = db.pendingAudit(1);
    expect(again.publish_attempts).toBe(1);
    expect(again.last_error).toBe('broker down');
  });
});

describe('MappingAssistantDb — template_verifications', () => {
  it('records verification', () => {
    const db = freshDb();
    db.recordTemplateVerification({
      manifest_sha: 'a'.repeat(64),
      total_templates: 3,
      passed: 3,
      failed: 0,
      failure_details: null,
    });
    const r = db.db.prepare('SELECT * FROM template_verifications').all() as { passed: number }[];
    expect(r.length).toBe(1);
    expect(r[0].passed).toBe(3);
  });
});
