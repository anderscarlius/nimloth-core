// WP-FHIR1 — SMART dev-stub (launch → authorize → token → context).

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { createServer as createNetServer } from 'node:net';
import pino from 'pino';
import type pg from 'pg';
import type { Producer } from 'kafkajs';

import { createServer } from '../server.js';
import { CoverageTracker } from '../stores/openehr/coverage-tracker.js';
import type { FhirPatient, FhirObservation } from '@nimloth-core/shared/types';
import type { FhirStore, StoreContext } from '../stores/types.js';
import type { StoreRouter } from '../stores/index.js';
import type { AuthConfig } from '../auth/config.js';

const PNR = '19500315-2384';

class FakeStore implements FhirStore {
  readonly canonicalStore = 'postgres' as const;
  async getPatient(_id: string, _ctx: StoreContext): Promise<FhirPatient | null> {
    return { resourceType: 'Patient', id: PNR };
  }
  async searchPatients(): Promise<FhirPatient[]> {
    return [];
  }
  async searchObservations(): Promise<FhirObservation[]> {
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

function makePool(): pg.Pool {
  return { query: async () => ({ rows: [] }) } as unknown as pg.Pool;
}

function makeProducer(): Producer {
  return { send: async () => [] } as unknown as Producer;
}

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

async function bootSmartApp(): Promise<{ base: string; close: () => Promise<void> }> {
  const port = await reservePort();
  const base = `http://127.0.0.1:${port}`;
  const fake = new FakeStore();
  const storeRouter: StoreRouter = {
    mode: 'postgres',
    primary: fake,
    secondary: null,
    coverage: new CoverageTracker(),
    canonicalStoreUsed: 'postgres',
  };
  const authConfig: AuthConfig = {
    mode: 'dev',
    keycloakIssuer: 'http://localhost/realms/test',
    hsaClaim: 'hsa_id',
  };

  const app = createServer({
    pool: makePool(),
    auditProducer: makeProducer(),
    logger: pino({ level: 'silent' }),
    instanceId: 'smart-test',
    mode: 'primary',
    storeRouter,
    authConfig,
    pdlEnforce: false,
    smartPublicBaseUrl: base,
    getMaterializerMetrics: () => ({ processed: 0, errors: 0, byType: {} }),
  });

  const inner = express();
  inner.use(app);
  const server = inner.listen(port, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));

  return {
    base,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

describe('SMART dev launch stub (WP-FHIR1)', () => {
  let app: { base: string; close: () => Promise<void> };

  beforeEach(async () => {
    app = await bootSmartApp();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it('exponerar .well-known/smart-configuration', async () => {
    const r = await fetch(`${app.base}/.well-known/smart-configuration`);
    expect(r.status).toBe(200);
    const body = (await r.json()) as { authorization_endpoint: string; token_endpoint: string };
    expect(body.authorization_endpoint).toBe(`${app.base}/smart/authorize`);
    expect(body.token_endpoint).toBe(`${app.base}/smart/token`);
  });

  it('ger patient + practitioner context via launch/token-flöde', async () => {
    const practitioner = 'Practitioner/SE-DEMO-PHYSICIAN';
    const launchRes = await fetch(`${app.base}/smart/dev/launch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ patient: PNR, practitioner }),
    });
    expect(launchRes.status).toBe(200);
    const launchBody = (await launchRes.json()) as { launch: string };
    expect(launchBody.launch).toBeTruthy();

    const redirectUri = `${app.base}/smart/callback`;
    const authorizeUrl = new URL(`${app.base}/smart/authorize`);
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('client_id', 'dev-public');
    authorizeUrl.searchParams.set('redirect_uri', redirectUri);
    authorizeUrl.searchParams.set('launch', launchBody.launch);
    authorizeUrl.searchParams.set('scope', 'launch patient/*.read');

    const authRes = await fetch(authorizeUrl.toString(), { redirect: 'manual' });
    expect(authRes.status).toBe(302);
    const location = authRes.headers.get('location');
    expect(location).toBeTruthy();
    const code = new URL(location!).searchParams.get('code');
    expect(code).toBeTruthy();

    const tokenRes = await fetch(`${app.base}/smart/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code!,
        client_id: 'dev-public',
        redirect_uri: redirectUri,
      }),
    });
    expect(tokenRes.status).toBe(200);
    const tokenBody = (await tokenRes.json()) as {
      access_token: string;
      patient: string;
      fhirUser: string;
    };
    expect(tokenBody.patient).toBe(PNR);
    expect(tokenBody.fhirUser).toBe(practitioner);

    const ctxRes = await fetch(`${app.base}/smart/context`, {
      headers: { authorization: `Bearer ${tokenBody.access_token}` },
    });
    expect(ctxRes.status).toBe(200);
    const ctx = (await ctxRes.json()) as { patient: string; practitioner: string };
    expect(ctx.patient).toBe(PNR);
    expect(ctx.practitioner).toBe(practitioner);
  });
});
