import { describe, expect, it, beforeEach } from 'vitest';
import path from 'node:path';
import pino from 'pino';
import {
  ModelRouter,
  type RouterConfig,
} from '@nimloth-core/model-router';
import { MappingAssistantDb } from '../db.js';
import { Observer, inferPatternFromReason } from '../observer.js';
import { loadAndVerifyPrompts } from '../prompt-store.js';

const PROMPTS = path.resolve(__dirname, '../../prompts');
const MIGRATIONS = path.resolve(__dirname, '../../migrations');

function setup(threshold = 3) {
  const db = new MappingAssistantDb(':memory:');
  db.migrate(MIGRATIONS, pino({ level: 'silent' }));
  const verification = loadAndVerifyPrompts(PROMPTS);
  const config: RouterConfig = {
    providers: [
      {
        id: 'mock',
        type: 'mock',
        enabled: true,
        models: ['mock-default'],
        dataResidency: 'on-premise',
        requiresInternet: false,
        config: {},
      },
    ],
    routing: [
      {
        task: 'mapping.observe',
        sensitivity: 'schema-only',
        prefer: [{ providerId: 'mock', model: 'mock-default' }],
        fallback: [],
      },
    ],
  };
  const router = new ModelRouter(config, {
    audit: (e) => db.enqueueAudit({ event_type: 'llm_invoked', payload: e }),
  });
  // Default-config: korta intervall för tester
  const observer = new Observer(
    {
      brokers: [],
      clientId: 'test-observer',
      groupId: 'test-observer-grp',
      topic: 'core.system.quality.metrics',
      windowSeconds: 86_400,
      threshold,
      evaluateIntervalMs: 1_000_000, // tickar inte automatiskt under tester
      pruneSeconds: 172_800,
    },
    db,
    router,
    verification.templates,
    pino({ level: 'silent' }),
  );
  return { db, observer };
}

describe('Observer', () => {
  it('inferPatternFromReason mappar reasons till patterns', () => {
    expect(inferPatternFromReason('unknown_enum_value')).toBe('new_enum_value');
    expect(inferPatternFromReason('pii_table_no_patient_ref')).toBe('new_table_with_pii_no_patient_ref');
    expect(inferPatternFromReason('garbage')).toBe('unknown');
  });

  it('handleEvent persisterar skip i SQLite', () => {
    const { db, observer } = setup();
    observer.handleEvent({
      type: 'skip',
      source_system: 'flexlab',
      source_table: 'results',
      column_name: 'order_type',
      reason: 'unknown_enum_value',
      sample_value: 'URGENT_HOME',
    });
    expect(observer.skipsRecordedTotal).toBe(1);
    const aggregates = db.aggregateSkips(86400);
    expect(aggregates.length).toBe(1);
    expect(aggregates[0].count).toBe(1);
  });

  it('evaluate skapar suggestion när tröskel passeras', async () => {
    const { db, observer } = setup(3);
    for (let i = 0; i < 4; i++) {
      observer.handleEvent({
        type: 'skip',
        source_system: 'flexlab',
        source_table: 'results',
        column_name: 'order_type',
        reason: 'unknown_enum_value',
        sample_value: `URGENT_${i}`,
      });
    }
    const r = await observer.evaluate();
    expect(r.created).toBe(1);
    expect(observer.suggestionsCreatedTotal).toBe(1);
    const pending = db.listSuggestions({ status: 'pending' });
    expect(pending.length).toBe(1);
    expect(pending[0].task).toBe('mapping.observe');
    expect(pending[0].review_notes).toContain('pattern=new_enum_value');
  });

  it('evaluate är idempotent — kör inte om för redan-triggat aggregat', async () => {
    const { observer } = setup(2);
    for (let i = 0; i < 5; i++) {
      observer.handleEvent({
        type: 'skip',
        source_system: 'flexlab',
        source_table: 'results',
        column_name: null,
        reason: 'unknown_table',
      });
    }
    const r1 = await observer.evaluate();
    const r2 = await observer.evaluate();
    expect(r1.created).toBe(1);
    expect(r2.created).toBe(0);
  });

  it('events under tröskel triggar inte', async () => {
    const { observer } = setup(10);
    for (let i = 0; i < 3; i++) {
      observer.handleEvent({
        type: 'skip',
        source_system: 'asynja',
        source_table: 'medications',
        column_name: 'route',
        reason: 'unknown_enum_value',
      });
    }
    const r = await observer.evaluate();
    expect(r.created).toBe(0);
  });

  it('flag/snapshot-events ignoreras', () => {
    const { observer } = setup();
    observer.handleEvent({ type: 'flag', source_system: 'x', source_table: 'y' });
    observer.handleEvent({ type: 'snapshot', source_system: 'x', source_table: 'y' });
    expect(observer.skipsRecordedTotal).toBe(0);
  });

  it('audit-outbox får ett llm_invoked-event vid suggestion-creation', async () => {
    const { db, observer } = setup(2);
    for (let i = 0; i < 3; i++) {
      observer.handleEvent({
        type: 'skip',
        source_system: 'flexlab',
        source_table: 'results',
        reason: 'unknown_enum_value',
      });
    }
    await observer.evaluate();
    expect(db.outboxStats().pending).toBeGreaterThanOrEqual(1);
  });
});
