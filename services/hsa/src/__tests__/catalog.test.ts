import { describe, expect, it } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { indexCatalog, loadCatalog } from '../catalog.js';
import { createServer } from '../server.js';

describe('hsa synthetic catalog', () => {
  it('validate returns true for known HSA-id', async () => {
    const catalog = await loadCatalog();
    const app = createServer(indexCatalog(catalog));
    const server = app.listen(0);
    await new Promise<void>((r) => server.once('listening', () => r()));
    const port = (server.address() as AddressInfo).port;

    const res = await fetch(`http://127.0.0.1:${port}/validate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ hsaId: 'SE123456789' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { valid: boolean };
    expect(body.valid).toBe(true);

    await new Promise<void>((r) => server.close(() => r()));
  });

  it('validate returns false for unknown HSA-id', async () => {
    const catalog = await loadCatalog();
    const inner = express();
    inner.use(createServer(indexCatalog(catalog)));
    const server = inner.listen(0);
    await new Promise<void>((r) => server.once('listening', () => r()));
    const port = (server.address() as AddressInfo).port;

    const res = await fetch(`http://127.0.0.1:${port}/validate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ hsaId: 'SE-NOT-IN-CATALOG' }),
    });
    const body = (await res.json()) as { valid: boolean };
    expect(body.valid).toBe(false);

    await new Promise<void>((r) => server.close(() => r()));
  });
});
