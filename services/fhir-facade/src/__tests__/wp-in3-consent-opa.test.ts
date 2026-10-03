// WP-IN3 — OPA på Patient-read, nödöppning med motivering i audit.

import { describe, expect, it } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import pino from 'pino';
import type pg from 'pg';
import type { Producer } from 'kafkajs';
import { createServer } from '../server.js';
import { CoverageTracker } from '../stores/openehr/coverage-tracker.js';
import type { FhirPatient } from '@nimloth-core/shared/types';
import type { FhirStore, StoreContext } from '../stores/types.js';
import type { StoreRouter } from '../stores/index.js';

class FakeStore implements FhirStore {
  readonly canonicalStore = 'postgres' as const;
  async getPatient(_id: string, _ctx: StoreContext): Promise<FhirPatient | null> {
    return {
      resourceType: 'Patient',
      id: '19770918-1111',
      identifier: [{ system: 'http://electronichealth.se/identifier/personnummer', value: '19770918-1111' }],
    };
  }
  async searchPatients(): Promise<FhirPatient[]> {
    return [];
  }
  async searchObservations(): Promise<never[]> {
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

interface CapturedAuditEvent {
  outcome: string;
  details?: { emergency_justification?: string; policy_decision?: string };
}

function makeFakePool(blocked: string[] = []): pg.Pool {
  return {
    query: async (sql: string, params?: unknown[]) => {
      if (sql.includes('blocked_patients')) {
        const pnr = (params as string[] | undefined)?.[0];
        if (pnr && blocked.includes(pnr)) {
          return { rows: [{ blocked_for: [] as string[] }] };
        }
        return { rows: [] };
      }
      return { rows: [] };
    },
  } as unknown as pg.Pool;
}

async function startApp(opts: {
  blocked?: string[];
  fetchResearchConsent?: (pnr: string) => Promise<boolean>;
}): Promise<{ base: string; events: CapturedAuditEvent[]; close: () => Promise<void> }> {
  const events: CapturedAuditEvent[] = [];
  const producer = {
    send: async (rec: { messages: Array<{ value: string }> }) => {
      for (const m of rec.messages) {
        events.push(JSON.parse(m.value) as CapturedAuditEvent);
      }
      return [];
    },
  } as unknown as Producer;

  const fake = new FakeStore();
  const storeRouter: StoreRouter = {
    mode: 'postgres',
    primary: fake,
    secondary: null,
    coverage: new CoverageTracker(),
    canonicalStoreUsed: 'postgres',
  };

  const app = createServer({
    pool: makeFakePool(opts.blocked ?? ['19770918-1111']),
    auditProducer: producer,
    logger: pino({ level: 'silent' }),
    instanceId: 'wp-in3',
    mode: 'primary',
    storeRouter,
    pdlEnforce: true,
    pdlMiddlewareOptions: {
      opaPatientRead: true,
      fetchResearchConsent: opts.fetchResearchConsent,
    },
    getMaterializerMetrics: () => ({ processed: 0, errors: 0, byType: {} }),
  });

  const inner = express();
  inner.use(app);
  const server = inner.listen(0);
  await new Promise<void>((r) => server.once('listening', () => r()));
  const port = (server.address() as AddressInfo).port;
  return {
    base: `http://127.0.0.1:${port}`,
    events,
    close: () => new Promise((r) => server.close(() => r())),
  };
}

async function flush(): Promise<void> {
  await new Promise((r) => setImmediate(r));
}

describe('WP-IN3 consent/OPA on Patient read', () => {
  it('blocks spärrad patient without emergency', async () => {
    const app = await startApp({});
    const res = await fetch(`${app.base}/fhir/r4/Patient/19770918-1111`, {
      headers: {
        'x-pdl-care-relation': 'true',
        'x-user-hsa': 'SE-TEST',
      },
    });
    expect(res.status).toBe(403);
    await flush();
    expect(app.events.some((e) => e.outcome === 'DENIED_PATIENT_BLOCKED')).toBe(true);
    await app.close();
  });

  it('permits emergency with justification and logs EMERGENCY_ACCESS + motivation', async () => {
    const app = await startApp({});
    const res = await fetch(`${app.base}/fhir/r4/Patient/19770918-1111`, {
      headers: {
        'x-pdl-emergency-access': 'true',
        'x-pdl-emergency-justification': 'Akut livshotande blödning',
        'x-pdl-care-unit': 'ER',
        'x-user-hsa': 'SE-TEST',
      },
    });
    expect(res.status).toBe(200);
    await flush();
    const ev = app.events.find((e) => e.outcome === 'EMERGENCY_ACCESS');
    expect(ev?.details?.emergency_justification).toBe('Akut livshotande blödning');
    expect(ev?.details?.policy_decision).toBe('PERMIT');
    await app.close();
  });

  it('denies RESEARCH without consent via OPA', async () => {
    const app = await startApp({
      blocked: [],
      fetchResearchConsent: async () => false,
    });
    const res = await fetch(`${app.base}/fhir/r4/Patient/19500315-2384`, {
      headers: {
        'x-pdl-care-relation': 'true',
        'x-pdl-purpose': 'RESEARCH',
        'x-user-hsa': 'SE-TEST',
      },
    });
    expect(res.status).toBe(403);
    await flush();
    expect(app.events.some((e) => e.outcome === 'DENIED_RESEARCH_CONSENT_DENIED')).toBe(true);
    await app.close();
  });
});
