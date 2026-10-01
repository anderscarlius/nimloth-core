// WP-FHIR1 — Patient + Observation (vitals) läses via openEHR/CDR-väg (inte tom mock-store).

import { describe, expect, it, vi, afterEach } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import pino from 'pino';
import type pg from 'pg';
import type { Producer } from 'kafkajs';

import { createServer } from '../server.js';
import { createStoreRouter } from '../stores/index.js';
import { EhrbaseAqlClient, type AqlResult } from '../stores/openehr/ehrbase-aql-client.js';
import { NIMLOTH_STUB_PATIENT_PROFILE } from '../profiles/se-stub.js';

const PNR = '19500315-2384';
const EHR_ID = 'ehr-test-uuid';

function patientAqlResult(): AqlResult {
  return {
    meta: {
      _executed_aql: 'SELECT',
      _schema_version: '1.0.0',
      _created: new Date().toISOString(),
      resultsize: 1,
    },
    q: 'patient',
    columns: [],
    rows: [[EHR_ID, null, '2026-01-01T00:00:00Z']],
  };
}

function vitalsAqlResult(): AqlResult {
  return {
    meta: {
      _executed_aql: 'SELECT',
      _schema_version: '1.0.0',
      _created: new Date().toISOString(),
      resultsize: 1,
    },
    q: 'obs',
    columns: [],
    rows: [
      [
        'comp-uid-1::nimloth::1',
        '2026-01-01T10:00:00Z',
        'vitals-template',
        'openEHR-EHR-OBSERVATION.body_temperature.v2',
        { _type: 'DV_QUANTITY', magnitude: 38.4, units: 'Cel' },
      ],
    ],
  };
}

function makePool(): pg.Pool {
  return {
    query: async (sql: string, params?: unknown[]) => {
      const normalized = sql.toLowerCase();
      if (params?.[0] === PNR && normalized.includes('openehr_ehr_cache') && normalized.includes('ehr_id')) {
        return { rows: [{ ehr_id: EHR_ID }] };
      }
      return { rows: [] };
    },
  } as unknown as pg.Pool;
}

function makeProducer(): Producer {
  return { send: async () => [] } as unknown as Producer;
}

describe('CDR read path (openehr store + EHRbase AQL)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returnerar Patient med SE profil-stub och vital-signs Observation från AQL', async () => {
    const executeSpy = vi.spyOn(EhrbaseAqlClient.prototype, 'execute').mockImplementation(async (aql) => {
      return aql.includes('COMPOSITION') ? vitalsAqlResult() : patientAqlResult();
    });

    const pool = makePool();
    const logger = pino({ level: 'silent' });
    const storeRouter = createStoreRouter({
      pool,
      ehrbaseUrl: 'http://ehrbase.test',
      mode: 'openehr',
      logger,
    });

    const app = createServer({
      pool,
      auditProducer: makeProducer(),
      logger,
      instanceId: 'cdr-read-test',
      mode: 'primary',
      storeRouter,
      pdlEnforce: false,
      getMaterializerMetrics: () => ({ processed: 0, errors: 0, byType: {} }),
    });

    const inner = express();
    inner.use(app);
    const server = inner.listen(0);
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));
    const port = (server.address() as AddressInfo).port;
    const base = `http://127.0.0.1:${port}`;
    const headers = {
      'x-pdl-care-relation': 'true',
      'x-pdl-care-unit': 'TestUnit',
      'x-user-hsa': 'SE-E2E-001',
    };

    const patientRes = await fetch(`${base}/fhir/r4/Patient/${PNR}`, { headers });
    expect(patientRes.status).toBe(200);
    const patient = (await patientRes.json()) as { meta?: { profile?: string[]; source?: string } };
    expect(patient.meta?.source).toMatch(/^openehr-ehr:/);
    expect(patient.meta?.profile).toContain(NIMLOTH_STUB_PATIENT_PROFILE);

    const obsRes = await fetch(`${base}/fhir/r4/Observation?patient=${PNR}&category=vital-signs`, { headers });
    expect(obsRes.status).toBe(200);
    const bundle = (await obsRes.json()) as {
      total: number;
      entry: Array<{ resource: { category?: Array<{ coding?: Array<{ code?: string }> }> } }>;
    };
    expect(bundle.total).toBe(1);
    expect(bundle.entry[0].resource.category?.[0]?.coding?.[0]?.code).toBe('vital-signs');
    expect(executeSpy).toHaveBeenCalled();

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});
