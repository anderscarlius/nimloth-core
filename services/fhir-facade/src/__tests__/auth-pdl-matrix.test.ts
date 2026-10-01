// AUTH_MODE × PDL-matris (DP-IN2) — syntetisk data, ingen Keycloak-container i CI.

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import pino from 'pino';
import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet } from 'jose';
import type pg from 'pg';
import type { Producer } from 'kafkajs';

import { createServer } from '../server.js';
import { CoverageTracker } from '../stores/openehr/coverage-tracker.js';
import type { FhirPatient, FhirObservation } from '@nimloth-core/shared/types';
import type { FhirStore, StoreContext, SearchObservationParams } from '../stores/types.js';
import type { StoreRouter } from '../stores/index.js';
import type { AuthConfig } from '../auth/config.js';

const TEST_ISSUER = 'http://test.local/realms/nimloth-core';

class FakeStore implements FhirStore {
  readonly canonicalStore = 'postgres' as const;
  async searchObservations(_p: SearchObservationParams, _ctx: StoreContext): Promise<FhirObservation[]> {
    return [];
  }
  async getPatient(_id: string, _ctx: StoreContext): Promise<FhirPatient | null> {
    return null;
  }
  async searchPatients(): Promise<FhirPatient[]> {
    return [];
  }
  async searchMedicationStatements(): Promise<never[]> {
    return [];
  }
  async searchProcedures(): Promise<never[]> {
    return [];
  }
  async searchConditions(): Promise<never[]> {
    return [];
  }
  async searchAllergyIntolerances(): Promise<never[]> {
    return [];
  }
}

function makeFakePool(): pg.Pool {
  return {
    query: async () => ({ rows: [] }),
  } as unknown as pg.Pool;
}

function makeFakeProducer(): Producer {
  return {
    send: async () => [],
  } as unknown as Producer;
}

async function startApp(opts: {
  authConfig: AuthConfig;
  verifyToken?: (token: string) => Promise<Record<string, unknown>>;
  pdlEnforce: boolean;
}): Promise<{ base: string; close: () => Promise<void> }> {
  const fake = new FakeStore();
  const storeRouter: StoreRouter = {
    mode: 'postgres',
    primary: fake,
    secondary: null,
    coverage: new CoverageTracker(),
    canonicalStoreUsed: 'postgres',
  };

  const app = createServer({
    pool: makeFakePool(),
    auditProducer: makeFakeProducer(),
    logger: pino({ level: 'silent' }),
    instanceId: 'auth-matrix',
    mode: 'primary',
    storeRouter,
    authConfig: opts.authConfig,
    authMiddlewareDeps: opts.verifyToken ? { verifyToken: opts.verifyToken } : undefined,
    pdlEnforce: opts.pdlEnforce,
    getMaterializerMetrics: () => ({ processed: 0, errors: 0, byType: {} }),
  });

  const inner = express();
  inner.use(app);
  const server = inner.listen(0);
  await new Promise<void>((r) => server.once('listening', () => r()));
  const port = (server.address() as AddressInfo).port;
  return {
    base: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

describe('AUTH_MODE matrix (DP-IN2)', () => {
  const prevAuthMode = process.env.AUTH_MODE;
  const prevNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    process.env.AUTH_MODE = prevAuthMode;
    process.env.NODE_ENV = prevNodeEnv;
  });

  it('dev: Bearer token treated as raw HSA-id (unchanged demo)', async () => {
    const app = await startApp({
      authConfig: { mode: 'dev', keycloakIssuer: TEST_ISSUER, hsaClaim: 'hsa_id' },
      pdlEnforce: true,
    });
    const res = await fetch(`${app.base}/fhir/r4/Observation?patient=19500315-2384`, {
      headers: {
        authorization: 'Bearer SE-DEV-BEARER-HSA',
        'x-pdl-care-relation': 'true',
      },
    });
    expect(res.status).toBe(200);
    await app.close();
  });

  it('dev: X-User-HSA header still works', async () => {
    const app = await startApp({
      authConfig: { mode: 'dev', keycloakIssuer: TEST_ISSUER, hsaClaim: 'hsa_id' },
      pdlEnforce: false,
    });
    const res = await fetch(`${app.base}/fhir/r4/Observation?patient=19500315-2384`, {
      headers: { 'x-user-hsa': 'SE-HEADER-HSA' },
    });
    expect(res.status).toBe(200);
    await app.close();
  });

  it('keycloak: no token → 401', async () => {
    const app = await startApp({
      authConfig: { mode: 'keycloak', keycloakIssuer: TEST_ISSUER, hsaClaim: 'hsa_id' },
      pdlEnforce: true,
    });
    const res = await fetch(`${app.base}/fhir/r4/Observation?patient=19500315-2384`);
    expect(res.status).toBe(401);
    await app.close();
  });

  it('keycloak: valid JWT + PDL enforce without care relation → 403', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const jwk = await exportJWK(publicKey);
    jwk.alg = 'RS256';
    jwk.kid = 'test-key';
    const jwks = createLocalJWKSet({ keys: [jwk] });

    const sign = async (hsaId: string) =>
      new SignJWT({ hsa_id: hsaId, role: 'PHYSICIAN' })
        .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
        .setIssuer(TEST_ISSUER)
        .setSubject(hsaId)
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(privateKey);

    const token = await sign('SE123456789');
    const app = await startApp({
      authConfig: { mode: 'keycloak', keycloakIssuer: TEST_ISSUER, hsaClaim: 'hsa_id' },
      verifyToken: async (t) => {
        const { jwtVerify } = await import('jose');
        const { payload } = await jwtVerify(t, jwks, { issuer: TEST_ISSUER });
        return payload as Record<string, unknown>;
      },
      pdlEnforce: true,
    });

    const denied = await fetch(`${app.base}/fhir/r4/Observation?patient=19500315-2384`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(denied.status).toBe(403);

    const ok = await fetch(`${app.base}/fhir/r4/Observation?patient=19500315-2384`, {
      headers: {
        authorization: `Bearer ${token}`,
        'x-pdl-care-relation': 'true',
      },
    });
    expect(ok.status).toBe(200);
    await app.close();
  });

  it('siths: alias of keycloak JWT path (no mTLS in this PR)', async () => {
    const app = await startApp({
      authConfig: { mode: 'siths', keycloakIssuer: TEST_ISSUER, hsaClaim: 'hsa_id' },
      pdlEnforce: false,
    });
    const res = await fetch(`${app.base}/fhir/r4/Observation?patient=19500315-2384`, {
      headers: { 'x-user-hsa': 'SE-SHOULD-NOT-WORK' },
    });
    expect(res.status).toBe(401);
    await app.close();
  });
});
