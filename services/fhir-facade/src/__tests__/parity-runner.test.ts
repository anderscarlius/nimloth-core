// ParityRunner-tester (Sprint 2 P3.4, steg 4.9 / AC14).
//
// Mockar FhirStore (FakeStore-klasser per store), Pool, Producer.
// Verifierar:
// - constructor failsa om mode != 'both' eller secondary === null
// - runForPatient producerar 6 snapshots med samma run_id
// - runForAll iterar openehr_ehr_cache
// - SYSTEM_CONTEXT skickas med userHsa='system:parity-runner'
// - Diff-failure i en resurs hindrar inte resten

import { describe, expect, it, beforeEach } from 'vitest';
import pino from 'pino';
import type pg from 'pg';
import type { Producer } from 'kafkajs';
import type {
  FhirPatient,
  FhirObservation,
  FhirMedicationStatement,
  FhirProcedure,
  FhirCondition,
  FhirAllergyIntolerance,
} from '@nimloth-core/shared/types';

import { ParityRunner } from '../parity/runner.js';
import { CoverageTracker } from '../stores/openehr/coverage-tracker.js';
import type { CanonicalStore, FhirStore, StoreContext } from '../stores/types.js';
import type { StoreRouter } from '../stores/index.js';

class FakeStore implements FhirStore {
  readonly canonicalStore: CanonicalStore;
  readonly calls: { method: string; ctx: StoreContext; pnr: string }[] = [];
  /** Per-method failure-injection för att testa partial-failure-paths. */
  failOn: Set<string> = new Set();

  constructor(canonicalStore: CanonicalStore) {
    this.canonicalStore = canonicalStore;
  }

  private maybeThrow(method: string): void {
    if (this.failOn.has(method)) throw new Error(`forced failure in ${method}`);
  }

  async getPatient(id: string, ctx: StoreContext): Promise<FhirPatient | null> {
    this.calls.push({ method: 'getPatient', ctx, pnr: id });
    this.maybeThrow('getPatient');
    return { resourceType: 'Patient', id, identifier: [], active: true };
  }
  async searchPatients(_p: { identifier?: string }, ctx: StoreContext): Promise<FhirPatient[]> {
    this.calls.push({ method: 'searchPatients', ctx, pnr: '' });
    return [];
  }
  async searchObservations(p: { patient: string }, ctx: StoreContext): Promise<FhirObservation[]> {
    this.calls.push({ method: 'searchObservations', ctx, pnr: p.patient });
    this.maybeThrow('searchObservations');
    return [];
  }
  async searchMedicationStatements(p: { patient: string }, ctx: StoreContext): Promise<FhirMedicationStatement[]> {
    this.calls.push({ method: 'searchMedicationStatements', ctx, pnr: p.patient });
    return [];
  }
  async searchProcedures(p: { patient: string }, ctx: StoreContext): Promise<FhirProcedure[]> {
    this.calls.push({ method: 'searchProcedures', ctx, pnr: p.patient });
    return [];
  }
  async searchConditions(p: { patient: string }, ctx: StoreContext): Promise<FhirCondition[]> {
    this.calls.push({ method: 'searchConditions', ctx, pnr: p.patient });
    return [];
  }
  async searchAllergyIntolerances(p: { patient: string }, ctx: StoreContext): Promise<FhirAllergyIntolerance[]> {
    this.calls.push({ method: 'searchAllergyIntolerances', ctx, pnr: p.patient });
    return [];
  }
}

interface FakePoolCall {
  sql: string;
  params: unknown[];
}

function makeFakePool(rows: Array<Record<string, unknown>> = []): { pool: pg.Pool; calls: FakePoolCall[] } {
  const calls: FakePoolCall[] = [];
  const pool = {
    query: async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params: params ?? [] });
      // openehr_ehr_cache-listning returnerar de injicerade rows
      if (sql.includes('openehr_ehr_cache')) return { rows };
      return { rows: [] };
    },
  } as unknown as pg.Pool;
  return { pool, calls };
}

interface FakeProducerEvent {
  topic: string;
  messages: Array<{ key: string | undefined; value: string }>;
}

function makeFakeProducer(): { producer: Producer; sends: FakeProducerEvent[] } {
  const sends: FakeProducerEvent[] = [];
  const producer = {
    send: async (rec: FakeProducerEvent) => {
      sends.push(rec);
      return [];
    },
  } as unknown as Producer;
  return { producer, sends };
}

function buildRouter(mode: 'postgres' | 'openehr' | 'both', postgres: FakeStore, openehr: FakeStore | null): StoreRouter {
  return {
    mode,
    primary: postgres,
    secondary: openehr,
    coverage: new CoverageTracker(),
    canonicalStoreUsed: 'postgres',
  };
}

describe('ParityRunner constructor — mode-validation', () => {
  const logger = pino({ level: 'silent' });

  it('failsa när mode = "postgres" (secondary är null)', () => {
    const pg = new FakeStore('postgres');
    const router = buildRouter('postgres', pg, null);
    const { pool } = makeFakePool();
    const { producer } = makeFakeProducer();
    expect(() => new ParityRunner({ storeRouter: router, pool, auditProducer: producer, logger })).toThrow(
      /CANONICAL_STORE=both/,
    );
  });

  it('failsa när mode = "openehr" (secondary är null)', () => {
    const oe = new FakeStore('openehr');
    const router = buildRouter('openehr', oe, null);
    const { pool } = makeFakePool();
    const { producer } = makeFakeProducer();
    expect(() => new ParityRunner({ storeRouter: router, pool, auditProducer: producer, logger })).toThrow(/both/);
  });

  it('lyckas när mode = "both" och secondary är satt', () => {
    const pg = new FakeStore('postgres');
    const oe = new FakeStore('openehr');
    const router = buildRouter('both', pg, oe);
    const { pool } = makeFakePool();
    const { producer } = makeFakeProducer();
    expect(() => new ParityRunner({ storeRouter: router, pool, auditProducer: producer, logger })).not.toThrow();
  });
});

describe('ParityRunner.runForPatient', () => {
  const logger = pino({ level: 'silent' });
  let postgres: FakeStore;
  let openehr: FakeStore;
  let runner: ParityRunner;
  let producer: Producer;
  let producerSends: FakeProducerEvent[];

  beforeEach(() => {
    postgres = new FakeStore('postgres');
    openehr = new FakeStore('openehr');
    const router = buildRouter('both', postgres, openehr);
    const { pool } = makeFakePool();
    const fake = makeFakeProducer();
    producer = fake.producer;
    producerSends = fake.sends;
    runner = new ParityRunner({ storeRouter: router, pool, auditProducer: producer, logger });
  });

  it('producerar 6 snapshots med samma run_id', async () => {
    const run = await runner.runForPatient('19500315-2384', 'manual');
    expect(run.snapshots).toHaveLength(6);
    expect(run.run_id).toMatch(/^[0-9a-f]{8}-/); // UUID-ish
    expect(run.failures).toEqual([]);
    // Alla 6 resurstyper representerade
    const types = new Set(run.snapshots.map((s) => s.resource_type));
    expect(types).toEqual(
      new Set(['Patient', 'Observation', 'MedicationStatement', 'Procedure', 'Condition', 'AllergyIntolerance']),
    );
  });

  it('anropar både postgres + openehr för alla 6 resurstyper', async () => {
    await runner.runForPatient('19500315-2384', 'manual');
    // Patient använder getPatient, övriga 5 använder respektive search-metod
    const expectedMethods = [
      'getPatient',
      'searchObservations',
      'searchMedicationStatements',
      'searchProcedures',
      'searchConditions',
      'searchAllergyIntolerances',
    ];
    for (const m of expectedMethods) {
      expect(postgres.calls.find((c) => c.method === m)).toBeTruthy();
      expect(openehr.calls.find((c) => c.method === m)).toBeTruthy();
    }
  });

  it('skickar SYSTEM_CONTEXT med userHsa="system:parity-runner"', async () => {
    await runner.runForPatient('19500315-2384', 'manual');
    const allCalls = [...postgres.calls, ...openehr.calls];
    for (const c of allCalls) {
      expect(c.ctx.userHsa).toBe('system:parity-runner');
    }
  });

  it('emitterar audit-event efter persistens', async () => {
    await runner.runForPatient('19500315-2384', 'manual');
    // emitParityAudit körs icke-blockerande efter recordSnapshot — kräver flush
    await new Promise((r) => setImmediate(r));
    expect(producerSends).toHaveLength(1);
    const event = JSON.parse(producerSends[0].messages[0].value);
    expect(event.action).toBe('PARITY_RUN');
    expect(event.actor.hsa_id).toBe('system:parity-runner');
  });

  it('partial-failure: failure i en resurstyp blockerar inte de övriga 5', async () => {
    postgres.failOn.add('searchObservations');
    const run = await runner.runForPatient('19500315-2384', 'manual');
    // 5 lyckade snapshots, 1 failure för Observation
    expect(run.snapshots).toHaveLength(5);
    expect(run.failures).toHaveLength(1);
    expect(run.failures[0].resource_type).toBe('Observation');
    expect(run.failures[0].patient_pnr).toBe('19500315-2384');
  });

  it('trigger-värde populeras i ParityRun', async () => {
    const r1 = await runner.runForPatient('19500315-2384', 'manual');
    const r2 = await runner.runForPatient('19500315-2384', 'test');
    expect(r1.trigger).toBe('manual');
    expect(r2.trigger).toBe('test');
  });
});

describe('ParityRunner.runForAll', () => {
  const logger = pino({ level: 'silent' });

  it('iterar över patient_pnr från openehr_ehr_cache', async () => {
    const postgres = new FakeStore('postgres');
    const openehr = new FakeStore('openehr');
    const router = buildRouter('both', postgres, openehr);
    const { pool } = makeFakePool([
      { patient_pnr: '19500315-2384' },
      { patient_pnr: '19850101-1234' },
    ]);
    const { producer } = makeFakeProducer();
    const runner = new ParityRunner({ storeRouter: router, pool, auditProducer: producer, logger });

    const run = await runner.runForAll('scheduled');
    // 2 patienter × 6 resurstyper = 12 snapshots i samma run
    expect(run.snapshots).toHaveLength(12);
    expect(run.patient_pnr).toBeNull(); // aggregat
    expect(run.trigger).toBe('scheduled');
  });

  it('tomt openehr_ehr_cache ⇒ 0 snapshots, ingen exception', async () => {
    const postgres = new FakeStore('postgres');
    const openehr = new FakeStore('openehr');
    const router = buildRouter('both', postgres, openehr);
    const { pool } = makeFakePool([]);
    const { producer } = makeFakeProducer();
    const runner = new ParityRunner({ storeRouter: router, pool, auditProducer: producer, logger });

    const run = await runner.runForAll('scheduled');
    expect(run.snapshots).toHaveLength(0);
  });
});
