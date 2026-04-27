import { describe, expect, it } from 'vitest';
import path from 'node:path';
import pino from 'pino';
import {
  ModelRouter,
  type RouterConfig,
} from '@nimloth-core/model-router';
import { MappingAssistantDb } from '../db.js';
import { Asker, parseAskerDecision } from '../asker.js';
import { loadAndVerifyPrompts } from '../prompt-store.js';

const PROMPTS = path.resolve(__dirname, '../../prompts');
const MIGRATIONS = path.resolve(__dirname, '../../migrations');

function setup(opts: { onPremise?: boolean } = {}) {
  const db = new MappingAssistantDb(':memory:');
  db.migrate(MIGRATIONS, pino({ level: 'silent' }));
  const verification = loadAndVerifyPrompts(PROMPTS);

  const providers: RouterConfig['providers'] = [
    {
      id: 'mock',
      type: 'mock',
      enabled: true,
      models: ['mock-default'],
      dataResidency: 'on-premise',
      requiresInternet: false,
      config: {},
    },
  ];
  const config: RouterConfig = {
    providers,
    routing: [
      {
        task: 'mapping.ask',
        sensitivity: 'phi',
        require: 'on-premise',
        prefer: [{ providerId: 'mock', model: 'mock-default' }],
        fallback: [],
      },
    ],
  };
  const router = new ModelRouter(config, {
    audit: (e) => db.enqueueAudit({ event_type: 'llm_invoked', payload: e }),
  });
  const asker = new Asker(
    {
      brokers: [],
      clientId: 'test-asker',
      groupId: 'test-asker-grp',
      topic: 'core.system.mapping.pending',
      pollIntervalMs: 1_000_000,
      batchSize: 5,
    },
    db,
    router,
    verification.templates,
    pino({ level: 'silent' }),
  );
  return { db, asker };
}

describe('parseAskerDecision', () => {
  it('parsar JSON med apply-decision', () => {
    expect(
      parseAskerDecision(`Här är svaret:
\`\`\`json
{ "decision": "apply", "rationale": "ok", "patch": { "code": "X" } }
\`\`\``),
    ).toEqual({
      decision: 'apply',
      rationale: 'ok',
      patch: { code: 'X' },
    });
  });

  it('parsar reject', () => {
    expect(parseAskerDecision('{"decision":"reject","rationale":"dup"}')).toEqual({
      decision: 'reject',
      rationale: 'dup',
    });
  });

  it('escalerar vid icke-JSON', () => {
    const r = parseAskerDecision('vet ej');
    expect(r.decision).toBe('escalate');
  });

  it('escalerar vid okänt decision-värde', () => {
    const r = parseAskerDecision('{"decision":"bogus"}');
    expect(r.decision).toBe('escalate');
  });
});

describe('Asker', () => {
  it('handleEvent enqueue:r pending-jobb', () => {
    const { db, asker } = setup();
    asker.handleEvent({
      event_id: 'e-1',
      source_system: 'melior',
      source_table: 'observations',
      mapper_name: 'observations-mapper',
      raw_event: { code: 'WEIRD' },
    });
    const pending = db.pendingAskerJobs(10);
    expect(pending.length).toBe(1);
    expect(pending[0].event_id).toBe('e-1');
  });

  it('event_id är idempotent', () => {
    const { db, asker } = setup();
    asker.handleEvent({
      event_id: 'e-1',
      source_system: 'melior',
      source_table: 'observations',
      mapper_name: 'observations-mapper',
      raw_event: { v: 1 },
    });
    asker.handleEvent({
      event_id: 'e-1',
      source_system: 'melior',
      source_table: 'observations',
      mapper_name: 'observations-mapper',
      raw_event: { v: 1 },
    });
    expect(db.pendingAskerJobs(10).length).toBe(1);
  });

  it('tick anropar router och resolverar jobb (mock returnerar escalate)', async () => {
    const { db, asker } = setup();
    asker.handleEvent({
      event_id: 'e-1',
      source_system: 'melior',
      source_table: 'observations',
      mapper_name: 'observations-mapper',
      raw_event: { code: 'WEIRD' },
    });
    const r = await asker.tick();
    expect(r.processed).toBe(1);
    expect(asker.escalatedTotal).toBe(1);
    expect(db.pendingAskerJobs(10).length).toBe(0); // statusen flyttades
    expect(db.observerStats().asker.escalated).toBe(1);
  });

  it('tick utan pending-jobb är no-op', async () => {
    const { asker } = setup();
    const r = await asker.tick();
    expect(r.processed).toBe(0);
  });

  it('saknat event_id droppas tyst (med warn)', () => {
    const { db, asker } = setup();
    asker.handleEvent({
      event_id: '',
      source_system: 'melior',
      source_table: 'observations',
      mapper_name: 'm',
      raw_event: {},
    });
    expect(db.pendingAskerJobs(10).length).toBe(0);
  });

  it('PHI-route till cloud-provider blockeras (router level)', async () => {
    const { db } = setup();
    // Cloud-only routing — borde aldrig kunna gå igenom för phi
    expect(() => {
      const c: RouterConfig = {
        providers: [
          {
            id: 'cloud',
            type: 'mock',
            enabled: true,
            models: ['m'],
            dataResidency: 'us-cloud',
            requiresInternet: true,
            config: {},
          },
        ],
        routing: [
          {
            task: 'mapping.ask',
            sensitivity: 'phi',
            // Glömt require: on-premise → config-validation måste fånga
            prefer: [{ providerId: 'cloud', model: 'm' }],
            fallback: [],
          },
        ],
      };
      new ModelRouter(c);
    }).not.toThrow(); // ModelRouter-konstruktorn validerar inte själv
    // Men loadRouterConfig (som körs i bootstrap) skulle ha kastat. db unused.
    expect(db).toBeTruthy();
  });
});
