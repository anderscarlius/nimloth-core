// PDL-bevarande-tester (Sprint 2 P3.3, Steg 4.6).
//
// Verifierar att införandet av store-router INTE försvagar PDL-kontrollerna.
// PDL-middleware körs FÖRE resource-handlers, så block-beslutet är taget
// innan store-routern ens hinner välja postgres/openehr. Tester här bevisar
// detta empiriskt med båda store-modes.
//
// Rationale: store-routern är en *post-PDL* concern. Skulle PDL någonsin
// flytta in i store-laget skulle vi ha en TOCTOU-bug där en cachad store-
// referens kunde respondera oavsett pdl-utfall. Den här testfilen finns
// för att fånga sådana regressionerna.
//
// Inga riktiga DB- eller Kafka-anslutningar — vi mockar pool + producer
// och använder fake FhirStore-implementationer. Det isolerar PDL-logiken
// från infra-tillstånd.

import { describe, expect, it, beforeEach } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import pino from 'pino';
import type pg from 'pg';
import type { Producer } from 'kafkajs';
import type {
  FhirPatient,
  FhirObservation,
  FhirMedicationStatement,
  FhirProcedure,
  FhirCondition,
} from '@nimloth-core/shared/types';

import { createServer } from '../server.js';
import { CoverageTracker } from '../stores/openehr/coverage-tracker.js';
import type {
  CanonicalStore,
  FhirStore,
  StoreContext,
  SearchObservationParams,
  SearchByPatientParams,
} from '../stores/types.js';
import type { StoreRouter } from '../stores/index.js';

// --- Mock-byggstenar ---------------------------------------------------------

class FakeStore implements FhirStore {
  readonly canonicalStore: CanonicalStore;
  readonly calls: { method: string; ctx: StoreContext }[] = [];

  constructor(canonicalStore: CanonicalStore) {
    this.canonicalStore = canonicalStore;
  }

  async getPatient(_id: string, ctx: StoreContext): Promise<FhirPatient | null> {
    this.calls.push({ method: 'getPatient', ctx });
    return {
      resourceType: 'Patient',
      id: _id,
      identifier: [{ system: 'urn:oid:1.2.752.129.2.1.3.1', value: _id }],
      active: true,
    };
  }
  async searchPatients(
    _params: { identifier?: string; family?: string; given?: string; limit?: number },
    ctx: StoreContext,
  ): Promise<FhirPatient[]> {
    this.calls.push({ method: 'searchPatients', ctx });
    return [];
  }
  async searchObservations(_p: SearchObservationParams, ctx: StoreContext): Promise<FhirObservation[]> {
    this.calls.push({ method: 'searchObservations', ctx });
    return [];
  }
  async searchMedicationStatements(_p: SearchByPatientParams, ctx: StoreContext): Promise<FhirMedicationStatement[]> {
    this.calls.push({ method: 'searchMedicationStatements', ctx });
    return [];
  }
  async searchProcedures(_p: SearchByPatientParams, ctx: StoreContext): Promise<FhirProcedure[]> {
    this.calls.push({ method: 'searchProcedures', ctx });
    return [];
  }
  async searchConditions(_p: SearchByPatientParams, ctx: StoreContext): Promise<FhirCondition[]> {
    this.calls.push({ method: 'searchConditions', ctx });
    return [];
  }
}

interface CapturedAuditEvent {
  resource_type: string;
  canonical_store?: string;
  outcome: string;
  patient_id?: string;
}

function makeFakeProducer(): { producer: Producer; events: CapturedAuditEvent[] } {
  const events: CapturedAuditEvent[] = [];
  const producer = {
    send: async (rec: { messages: Array<{ value: string }> }) => {
      for (const m of rec.messages) {
        events.push(JSON.parse(m.value));
      }
      return [];
    },
  } as unknown as Producer;
  return { producer, events };
}

function makeFakePool(blockedRows: string[] = []): pg.Pool {
  // PDL-middleware kör SELECT blocked_for FROM blocked_patients WHERE personnummer=$1.
  // Returnera rader när PNR finns i blockedRows-listan; tomt annars.
  return {
    query: async (sql: string, params?: unknown[]) => {
      if (sql.includes('blocked_patients')) {
        const pnr = (params as string[] | undefined)?.[0];
        if (pnr && blockedRows.includes(pnr)) {
          return { rows: [{ blocked_for: [] }] };
        }
        return { rows: [] };
      }
      return { rows: [] };
    },
  } as unknown as pg.Pool;
}

function buildStoreRouter(mode: 'postgres' | 'openehr'): StoreRouter & { fake: FakeStore } {
  const fake = new FakeStore(mode);
  const router: StoreRouter = {
    mode,
    primary: fake,
    secondary: null,
    coverage: new CoverageTracker(),
    canonicalStoreUsed: mode,
  };
  return Object.assign(router, { fake });
}

interface TestApp {
  base: string;
  events: CapturedAuditEvent[];
  fake: FakeStore;
  close: () => Promise<void>;
}

async function startTestApp(opts: {
  storeMode: 'postgres' | 'openehr';
  pdlEnforce: boolean;
  blockedPatients?: string[];
}): Promise<TestApp> {
  const { producer, events } = makeFakeProducer();
  const pool = makeFakePool(opts.blockedPatients ?? []);
  const storeRouter = buildStoreRouter(opts.storeMode);
  const app = createServer({
    pool,
    auditProducer: producer,
    logger: pino({ level: 'silent' }),
    instanceId: 'test',
    mode: 'primary',
    storeRouter,
    pdlEnforce: opts.pdlEnforce,
    getMaterializerMetrics: () => ({ processed: 0, errors: 0, byType: {} }),
  });

  // Wrappa createServer-utdata i en express-listener.
  const inner = express();
  inner.use(app);
  const server = inner.listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const port = (server.address() as AddressInfo).port;

  return {
    base: `http://127.0.0.1:${port}`,
    events,
    fake: storeRouter.fake,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

// res.on('finish') triggar audit-publish — vi kan behöva en mikropause innan
// vi inspekterar events-arrayen. Fångar via Promise.resolve()-kö i stället
// för setTimeout för att hålla testen deterministisk.
async function flushMicrotasks(): Promise<void> {
  await new Promise((r) => setImmediate(r));
}

// --- Tester ------------------------------------------------------------------

describe('PDL preservation across canonical-store modes', () => {
  let app: TestApp;
  beforeEach(() => {
    // ingen global setup behövs — varje test bygger sin egen app.
  });

  it('1. pdl_blocks_no_care_relation_postgres: postgres-läge utan vårdrelation → 403', async () => {
    app = await startTestApp({ storeMode: 'postgres', pdlEnforce: true });
    const res = await fetch(`${app.base}/fhir/r4/Observation?patient=19500315-2384`);
    expect(res.status).toBe(403);
    expect(app.fake.calls).toHaveLength(0); // store anropas aldrig
    await flushMicrotasks();
    const auditForReq = app.events.find((e) => e.resource_type === 'Observation');
    expect(auditForReq?.outcome).toBe('DENIED_NO_CARE_RELATION');
    await app.close();
  });

  it('2. pdl_blocks_no_care_relation_openehr (KRITISK): openehr-läge utan vårdrelation → 403', async () => {
    // Detta är säkerhetstestet. Om openehr-vägen släpper igenom där postgres
    // blockerar = bug. Förväntat: identiskt utfall som test 1 ovan.
    app = await startTestApp({ storeMode: 'openehr', pdlEnforce: true });
    const res = await fetch(`${app.base}/fhir/r4/Observation?patient=19500315-2384`);
    expect(res.status).toBe(403);
    expect(app.fake.calls).toHaveLength(0); // openehr-store får aldrig anropet
    await flushMicrotasks();
    const auditForReq = app.events.find((e) => e.resource_type === 'Observation');
    expect(auditForReq?.outcome).toBe('DENIED_NO_CARE_RELATION');
    await app.close();
  });

  it('3. pdl_audit_logged_for_postgres_reads: lyckad postgres-read loggar canonical_store=postgres', async () => {
    app = await startTestApp({ storeMode: 'postgres', pdlEnforce: true });
    const res = await fetch(`${app.base}/fhir/r4/Observation?patient=19500315-2384`, {
      headers: {
        'x-pdl-care-relation': 'true',
        'x-pdl-care-unit': 'TestUnit',
        'x-user-hsa': 'SE-TEST-001',
      },
    });
    expect(res.status).toBe(200);
    expect(app.fake.calls.find((c) => c.method === 'searchObservations')).toBeTruthy();
    await flushMicrotasks();
    const auditForReq = app.events.find((e) => e.resource_type === 'Observation');
    expect(auditForReq?.outcome).toBe('SUCCESS');
    expect(auditForReq?.canonical_store).toBe('postgres');
    await app.close();
  });

  it('4. pdl_audit_logged_for_openehr_reads: lyckad openehr-read loggar canonical_store=openehr', async () => {
    // Validerar att audit-fältet (Anders B) populeras korrekt — utan detta
    // är audit blind för vilken store som svarade.
    app = await startTestApp({ storeMode: 'openehr', pdlEnforce: true });
    const res = await fetch(`${app.base}/fhir/r4/Observation?patient=19500315-2384`, {
      headers: {
        'x-pdl-care-relation': 'true',
        'x-pdl-care-unit': 'TestUnit',
        'x-user-hsa': 'SE-TEST-001',
      },
    });
    expect(res.status).toBe(200);
    expect(app.fake.calls.find((c) => c.method === 'searchObservations')).toBeTruthy();
    await flushMicrotasks();
    const auditForReq = app.events.find((e) => e.resource_type === 'Observation');
    expect(auditForReq?.outcome).toBe('SUCCESS');
    expect(auditForReq?.canonical_store).toBe('openehr');
    await app.close();
  });

  it('5. pdl_spärr_blocks_both_stores: spärrad patient utan emergency → 403 oavsett canonical-store', async () => {
    const blocked = '19990101-1234';

    const postgresApp = await startTestApp({
      storeMode: 'postgres',
      pdlEnforce: true,
      blockedPatients: [blocked],
    });
    const r1 = await fetch(`${postgresApp.base}/fhir/r4/Observation?patient=${blocked}`, {
      headers: { 'x-pdl-care-relation': 'true', 'x-user-hsa': 'SE-TEST' },
    });
    expect(r1.status).toBe(403);
    expect(postgresApp.fake.calls).toHaveLength(0);
    await postgresApp.close();

    const openehrApp = await startTestApp({
      storeMode: 'openehr',
      pdlEnforce: true,
      blockedPatients: [blocked],
    });
    const r2 = await fetch(`${openehrApp.base}/fhir/r4/Observation?patient=${blocked}`, {
      headers: { 'x-pdl-care-relation': 'true', 'x-user-hsa': 'SE-TEST' },
    });
    expect(r2.status).toBe(403);
    expect(openehrApp.fake.calls).toHaveLength(0);
    await openehrApp.close();
  });

  it('6. pdl_emergency_access_logged_for_openehr: nödöppning passerar spärr och loggas korrekt', async () => {
    // Verifierar att emergency-flag fungerar identiskt mot openehr-vägen
    // — patient-data lämnas ut, audit loggar EMERGENCY_ACCESS + canonical_store=openehr.
    const blocked = '19990101-1234';
    app = await startTestApp({
      storeMode: 'openehr',
      pdlEnforce: true,
      blockedPatients: [blocked],
    });
    const res = await fetch(`${app.base}/fhir/r4/Observation?patient=${blocked}`, {
      headers: {
        'x-pdl-emergency-access': 'true',
        'x-pdl-care-unit': 'ER',
        'x-user-hsa': 'SE-EMERG-001',
      },
    });
    expect(res.status).toBe(200);
    await flushMicrotasks();
    const auditForReq = app.events.find((e) => e.resource_type === 'Observation');
    expect(auditForReq?.outcome).toBe('EMERGENCY_ACCESS');
    expect(auditForReq?.canonical_store).toBe('openehr');
    await app.close();
  });
});
