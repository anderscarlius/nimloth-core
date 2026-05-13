// Tester för Express-server-setup (B25.2.4).
// Täcker GET / (service-index, ny) + GET /health (täckning saknades tidigare).

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import pino from 'pino';
import { ModelRouter } from '@nimloth-core/model-router';
import type {
  InvokeRequest,
  Provider,
  ProviderDescriptor,
  RouterConfig,
} from '@nimloth-core/model-router';
import { CompositionMapperDb } from '../db.js';
import { AuditPublisher } from '../audit-publisher.js';
import { createApp } from '../server.js';
import type { CompositionMapperConfig } from '../config.js';

const silentLogger = pino({ level: 'silent' });

// Minimal mock-provider för router-instantiering. Anropas aldrig av / eller /health.
class NoopProvider implements Provider {
  constructor(public readonly descriptor: ProviderDescriptor) {}
  async invoke(): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
    return { text: '', inputTokens: 0, outputTokens: 0 };
  }
  async isHealthy(): Promise<boolean> {
    return true;
  }
}

function makeRouterConfig(): RouterConfig {
  return {
    providers: [
      {
        id: 'mock',
        type: 'mock',
        enabled: true,
        models: ['m'],
        dataResidency: 'on-premise',
        requiresInternet: false,
        config: {},
      },
    ],
    routing: [],
  };
}

function makeConfig(dataMode: 'phi' | 'synthetic' = 'synthetic'): CompositionMapperConfig {
  return {
    port: 0,
    logLevel: 'silent',
    dbPath: '/tmp/test.db',
    migrationsPath: '/tmp/migrations',
    dataMode,
    kafka: {
      brokers: ['disabled'],
      clientId: 'test',
      auditTopic: 'test',
      drainIntervalMs: 60_000,
    },
  };
}

function makeDeps(opts: { dataMode?: 'phi' | 'synthetic' } = {}) {
  const tmp = mkdtempSync(join(tmpdir(), 'cm-server-test-'));
  const db = new CompositionMapperDb(join(tmp, 'test.sqlite'));
  db.migrate(join(__dirname, '..', '..', 'migrations'), silentLogger);
  const publisher = new AuditPublisher(
    {
      brokers: ['disabled'],
      clientId: 'test',
      topic: 'test',
      drainIntervalMs: 60_000,
      batchSize: 10,
    },
    db,
    silentLogger,
  );
  const router = new ModelRouter(makeRouterConfig(), {
    providerFactory: (d) => new NoopProvider(d),
  });
  return {
    publisher,
    logger: silentLogger,
    loadedAt: '2026-05-13T00:00:00.000Z',
    router,
    config: makeConfig(opts.dataMode),
    db,
  };
}

// ============================================================
// GET / — service-index (B25.2.4)
// ============================================================

describe('GET / (service index)', () => {
  it('returnerar 200 med service-namn, version, dataMode och endpoint-lista', async () => {
    const app = createApp(makeDeps({ dataMode: 'synthetic' }));
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      service: 'composition-mapper',
      description: expect.stringContaining('FHIR'),
      version: expect.any(String),
      dataMode: expect.stringMatching(/^(phi|synthetic)$/),
      endpoints: {
        health: expect.stringContaining('/health'),
        mapMedicationStatement: expect.stringContaining('/api/v1/map/medication-statement'),
      },
    });
  });

  it('returnerar application/json content-type', async () => {
    const app = createApp(makeDeps());
    const res = await request(app).get('/');
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });

  it('reflekterar dataMode-värdet från config (phi vs synthetic)', async () => {
    const synthApp = createApp(makeDeps({ dataMode: 'synthetic' }));
    const phiApp = createApp(makeDeps({ dataMode: 'phi' }));
    const synthRes = await request(synthApp).get('/');
    const phiRes = await request(phiApp).get('/');
    expect(synthRes.body.dataMode).toBe('synthetic');
    expect(phiRes.body.dataMode).toBe('phi');
  });
});

// ============================================================
// GET /health — täckning saknades tidigare
// ============================================================

describe('GET /health', () => {
  it('returnerar 200 med status ok + dataMode + audit-status', async () => {
    const app = createApp(makeDeps());
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'ok',
      service: 'composition-mapper',
      dataMode: 'synthetic',
      audit: {
        disabled: true,
      },
    });
  });

  it('returnerar application/json content-type', async () => {
    const app = createApp(makeDeps());
    const res = await request(app).get('/health');
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });
});
