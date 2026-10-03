import { describe, expect, it } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { createServer } from '../server.js';
import { indexRegistry, type ConsentRegistry } from '../registry.js';

const fixture: ConsentRegistry = {
  data_class: 0,
  synthetic: true,
  blocks: [{ personnummer: '19770918-1111', blocked_for: [], reason: 'demo' }],
  consents: [
    { personnummer: '19500315-2384', purpose: 'RESEARCH', granted: true },
    { personnummer: '19770918-1111', purpose: 'RESEARCH', granted: false },
  ],
};

async function listen(app: express.Express): Promise<{ base: string; close: () => Promise<void> }> {
  const server = app.listen(0);
  await new Promise<void>((r) => server.once('listening', () => r()));
  const port = (server.address() as AddressInfo).port;
  return {
    base: `http://127.0.0.1:${port}`,
    close: () => new Promise((r) => server.close(() => r())),
  };
}

describe('consent stub', () => {
  it('POST /decide deny blocked patient without emergency', async () => {
    const app = createServer({ index: indexRegistry(fixture) });
    const { base, close } = await listen(app);
    const res = await fetch(`${base}/decide`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        patient: { pnr: '19770918-1111' },
        has_care_relation: true,
        purpose: 'CARE',
      }),
    });
    const json = (await res.json()) as { allow: boolean; reason?: string };
    expect(json.allow).toBe(false);
    expect(json.reason).toBe('PATIENT_BLOCKED');
    await close();
  });

  it('POST /decide permit emergency with justification', async () => {
    const app = createServer({ index: indexRegistry(fixture) });
    const { base, close } = await listen(app);
    const res = await fetch(`${base}/decide`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        patient: { pnr: '19770918-1111' },
        emergency: true,
        emergency_justification: 'Akut psykiatrisk kris',
        purpose: 'EMERGENCY',
      }),
    });
    const json = (await res.json()) as { allow: boolean };
    expect(json.allow).toBe(true);
    await close();
  });
});
