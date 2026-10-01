// WP-CDS1 — hermetisk CDS Hooks smoke (discovery + patient-view med syntetisk prefetch).

import { describe, expect, it, afterEach } from 'vitest';
import pino from 'pino';
import { createServer as createNetServer } from 'node:net';
import { createServer } from '../server.js';
import { FhirClient } from '../fhir-client.js';
import {
  SYNTHETIC_PNR,
  syntheticFruAnderssonPrefetch,
} from '../fixtures/synthetic-fru-andersson.js';

async function reservePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const s = createNetServer();
    s.listen(0, '127.0.0.1', () => {
      const addr = s.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('no port'));
        return;
      }
      const port = addr.port;
      s.close(() => resolve(port));
    });
  });
}

async function bootCds(): Promise<{ base: string; close: () => Promise<void> }> {
  const port = await reservePort();
  const base = `http://127.0.0.1:${port}`;
  const logger = pino({ level: 'silent' });
  const fhirClient = new FhirClient('http://127.0.0.1:1');
  const app = createServer({ fhirClient, logger });
  const server = app.listen(port, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  return {
    base,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}

describe('WP-CDS1 CDS Hooks smoke', () => {
  let runtime: Awaited<ReturnType<typeof bootCds>> | undefined;

  afterEach(async () => {
    await runtime?.close();
    runtime = undefined;
  });

  it('GET /cds-services listar patient-view hooks (discovery)', async () => {
    runtime = await bootCds();
    const r = await fetch(`${runtime.base}/cds-services`);
    expect(r.ok).toBe(true);
    const body = (await r.json()) as { services: Array<{ id: string; hook: string }> };
    expect(body.services.length).toBeGreaterThanOrEqual(1);
    expect(body.services.some((s) => s.hook === 'patient-view')).toBe(true);
    expect(body.services.some((s) => s.id === 'core-anticoagulation-check')).toBe(true);
  });

  it('POST patient-view med syntetisk prefetch returnerar cards utan FHIR-anrop', async () => {
    runtime = await bootCds();
    const prefetch = syntheticFruAnderssonPrefetch();
    const hookBody = {
      hookInstance: `wp-cds1-${crypto.randomUUID()}`,
      hook: 'patient-view',
      context: {
        userId: 'Practitioner/SE-WP-CDS1-DEMO',
        patientId: `Patient/${SYNTHETIC_PNR}`,
      },
      prefetch,
    };
    const r = await fetch(`${runtime.base}/cds-services/core-patient-alerts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(hookBody),
    });
    expect(r.ok).toBe(true);
    const resp = (await r.json()) as { cards: Array<{ indicator: string; summary: string }> };
    expect(resp.cards.length).toBe(3);
    expect(resp.cards.map((c) => c.indicator)).toContain('critical');
  });

  it('GET /health rapporterar cds-hooks', async () => {
    runtime = await bootCds();
    const r = await fetch(`${runtime.base}/health`);
    expect(r.ok).toBe(true);
    const body = (await r.json()) as { status: string; service: string };
    expect(body.status).toBe('ok');
    expect(body.service).toBe('cds-hooks');
  });
});
