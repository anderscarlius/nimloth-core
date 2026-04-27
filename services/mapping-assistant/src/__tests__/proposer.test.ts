import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import pino from 'pino';
import { tmpdir } from 'node:os';
import {
  ModelRouter,
  type RouterConfig,
} from '@nimloth-core/model-router';
import { MappingAssistantDb } from '../db.js';
import { Proposer, extractCodeBlock, stripCodeBlock } from '../proposer.js';
import { loadAndVerifyPrompts } from '../prompt-store.js';

const PROMPTS = path.resolve(__dirname, '../../prompts');
const MIGRATIONS = path.resolve(__dirname, '../../migrations');

function setup() {
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
        task: 'mapping.propose',
        sensitivity: 'schema-only',
        prefer: [{ providerId: 'mock', model: 'mock-default' }],
        fallback: [],
      },
    ],
  };
  const router = new ModelRouter(config, {
    audit: (event) => db.enqueueAudit({ event_type: 'llm_invoked', payload: event }),
  });
  const proposedDir = mkdtempSync(path.join(tmpdir(), 'proposed-'));
  const proposer = new Proposer(router, db, verification.templates, proposedDir, pino({ level: 'silent' }));
  return { db, router, proposer, proposedDir };
}

describe('Proposer', () => {
  it('genererar förslag, persisterar i SQLite, skriver utkastfil', async () => {
    const { db, proposer, proposedDir } = setup();
    try {
      const sugg = await proposer.propose({
        source: 'flexlab.results',
        target: 'core.clinical.lab.result',
        schema: [
          { column: 'patient_id', type: 'integer' },
          { column: 'order_type', type: 'text' },
          { column: 'result_value', type: 'numeric' },
        ],
        samples: [{ patient_id: 1, order_type: 'STD', result_value: 42 }],
      });
      expect(sugg.status).toBe('pending');
      expect(sugg.provider_id).toBe('mock');
      expect(sugg.template_name).toBe('propose-mapping');
      expect(sugg.template_sha).toMatch(/^[0-9a-f]{64}$/);
      expect(sugg.proposed_path).toBeTruthy();
      expect(existsSync(sugg.proposed_path!)).toBe(true);
      const content = readFileSync(sugg.proposed_path!, 'utf-8');
      expect(content).toContain('mapMockTable');

      // Outbox ska ha fått ett llm_invoked-event
      expect(db.outboxStats().pending).toBeGreaterThanOrEqual(1);
    } finally {
      rmSync(proposedDir, { recursive: true });
    }
  });

  it('flera anrop får olika filnamn', async () => {
    const { proposer, proposedDir } = setup();
    try {
      await proposer.propose({
        source: 's1',
        target: 'core.x.y',
        schema: [{ column: 'a', type: 'text' }],
      });
      await new Promise((r) => setTimeout(r, 5));
      await proposer.propose({
        source: 's2',
        target: 'core.x.y',
        schema: [{ column: 'b', type: 'text' }],
      });
      const files = readdirSync(proposedDir);
      expect(files.length).toBe(2);
    } finally {
      rmSync(proposedDir, { recursive: true });
    }
  });
});

describe('extractCodeBlock', () => {
  it('plockar TS-block', () => {
    const text = "Här är koden:\n```typescript\nexport function f() {}\n```\nKlart.";
    expect(extractCodeBlock(text)).toBe('export function f() {}');
  });
  it('returnerar null när inget block', () => {
    expect(extractCodeBlock('bara text')).toBeNull();
  });
});

describe('stripCodeBlock', () => {
  it('tar bort kodblock', () => {
    const text = "Header.\n```ts\ncode\n```\nFooter.";
    expect(stripCodeBlock(text).trim()).toBe('Header.\n\nFooter.');
  });
});
