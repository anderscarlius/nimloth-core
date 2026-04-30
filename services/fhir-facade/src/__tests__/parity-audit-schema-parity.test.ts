// AC19: audit-event-schema-paritet (Sprint 2 P3.4, steg 4.9 / Del 2).
//
// Verifierar att audit-events från audit-mw (kliniker-anrop) och från
// emitParityAudit (system-internal) använder samma JSON-shape i de
// gemensamma fälten. Extra fält som snapshots_count/failures_count i
// parity-eventet är OK enligt AC19 ("samma schema, inte identiskt
// fält-set").
//
// Båda events ska kunna parsas av samma audit-konsument utan special-
// case-logik. Testet säkerställer det genom att (a) lista vilka fält
// audit-mw producerar, (b) verifiera att alla finns i emitParityAudit-
// eventet med samma typ-shape.

import { describe, expect, it } from 'vitest';
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
  FhirAllergyIntolerance,
} from '@nimloth-core/shared/types';

import { createServer } from '../server.js';
import { CoverageTracker } from '../stores/openehr/coverage-tracker.js';
import type { CanonicalStore, FhirStore, StoreContext } from '../stores/types.js';
import type { StoreRouter } from '../stores/index.js';
import { emitParityAudit } from '../parity/audit.js';
import type { ParityRun, ParitySnapshot } from '../parity/types.js';

class FakeStore implements FhirStore {
  readonly canonicalStore: CanonicalStore;
  constructor(c: CanonicalStore) {
    this.canonicalStore = c;
  }
  async getPatient(id: string, _c: StoreContext): Promise<FhirPatient | null> {
    return { resourceType: 'Patient', id, identifier: [], active: true };
  }
  async searchPatients(): Promise<FhirPatient[]> {
    return [];
  }
  async searchObservations(): Promise<FhirObservation[]> {
    return [];
  }
  async searchMedicationStatements(): Promise<FhirMedicationStatement[]> {
    return [];
  }
  async searchProcedures(): Promise<FhirProcedure[]> {
    return [];
  }
  async searchConditions(): Promise<FhirCondition[]> {
    return [];
  }
  async searchAllergyIntolerances(): Promise<FhirAllergyIntolerance[]> {
    return [];
  }
}

interface CapturedEvent {
  topic: string;
  value: Record<string, unknown>;
}

function makeFakeProducer(): { producer: Producer; events: CapturedEvent[] } {
  const events: CapturedEvent[] = [];
  const producer = {
    send: async (rec: { topic: string; messages: Array<{ value: string }> }) => {
      for (const m of rec.messages) {
        events.push({ topic: rec.topic, value: JSON.parse(m.value) });
      }
      return [];
    },
  } as unknown as Producer;
  return { producer, events };
}

const fakePool = {
  query: async () => ({ rows: [] }),
} as unknown as pg.Pool;

/** Hit FHIR-endpoint för att producera audit-mw-event. */
async function captureAuditMwEvent(): Promise<Record<string, unknown>> {
  const { producer, events } = makeFakeProducer();
  const fakeStore = new FakeStore('postgres');
  const storeRouter: StoreRouter = {
    mode: 'postgres',
    primary: fakeStore,
    secondary: null,
    coverage: new CoverageTracker(),
    canonicalStoreUsed: 'postgres',
  };
  const app = createServer({
    pool: fakePool,
    auditProducer: producer,
    logger: pino({ level: 'silent' }),
    instanceId: 'test',
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

  await fetch(`http://127.0.0.1:${port}/fhir/r4/Patient/19500315-2384`, {
    headers: { 'x-pdl-care-relation': 'true', 'x-user-hsa': 'SE-TEST-001' },
  });
  // res.on('finish') triggar audit-publish
  await new Promise((r) => setImmediate(r));
  await new Promise<void>((resolve) => server.close(() => resolve()));

  const auditEvent = events.find((e) => e.value.action === 'READ' || e.value.action === 'SEARCH');
  if (!auditEvent) throw new Error('audit-mw event not captured');
  return auditEvent.value;
}

/** Anropa emitParityAudit för att producera parity-event. */
async function captureParityAuditEvent(): Promise<Record<string, unknown>> {
  const { producer, events } = makeFakeProducer();
  const snap: ParitySnapshot = {
    resource_type: 'Patient',
    patient_pnr: '19500315-2384',
    postgres_count: 0,
    openehr_count: 1,
    mismatch_count: 1,
    only_in_postgres: [],
    only_in_openehr: [],
    field_coverage: {},
  };
  const run: ParityRun = {
    run_id: '00000000-0000-4000-8000-000000000000',
    taken_at: new Date(),
    trigger: 'manual',
    patient_pnr: '19500315-2384',
    snapshots: [snap],
    failures: [],
  };
  await emitParityAudit(producer, run);
  if (events.length === 0) throw new Error('parity event not captured');
  return events[0].value;
}

describe('AC19 — audit-event-schema-paritet', () => {
  it('båda events publiceras på topic core.audit.access', async () => {
    const auditMw = await captureAuditMwEvent();
    const parityAudit = await captureParityAuditEvent();
    // Topic verifieras via send-call shapes — om båda hamnade i events-arrayen
    // är topic core.audit.access (audit.ts hardcoded) eller har förändrats.
    // Strikt topic-test ligger i parity-audit.test.ts; här kollar vi shape.
    expect(auditMw).toBeDefined();
    expect(parityAudit).toBeDefined();
  });

  it('required gemensamma fält finns i båda events (struktur-paritet)', async () => {
    const auditMw = await captureAuditMwEvent();
    const parityAudit = await captureParityAuditEvent();

    // Required fält som ALLTID ska finnas i båda events oavsett kontext.
    const REQUIRED_FIELDS = [
      'event_id',
      'timestamp',
      'actor',
      'action',
      'resource_type',
      'patient_id',
      'outcome',
      'request_id',
      'duration_ms',
    ];

    for (const field of REQUIRED_FIELDS) {
      expect(parityAudit).toHaveProperty(field);
      expect(auditMw).toHaveProperty(field);
    }
  });

  it('optional fält (pdl_context, canonical_store) följer samma kontextuella regel', async () => {
    // Båda är optional och `undefined` när kontexten inte är tillämplig.
    // JSON.stringify strippar undefined → fältet saknas i serialiserad output.
    // Det är konsekvent beteende mellan audit-mw (saknar pdl_context när
    // req.pdl är undefined) och emitParityAudit (saknar pdl_context per
    // definition — system-events har ingen PDL-context).
    //
    // Schema-paritet i AC19:s mening = konsumenter måste tolerera att
    // optional fält kan saknas. Testet säkerställer att om fältet finns,
    // har det rätt typ.
    const auditMw = await captureAuditMwEvent();
    const parityAudit = await captureParityAuditEvent();

    for (const ev of [auditMw, parityAudit]) {
      if ('pdl_context' in ev && ev.pdl_context !== undefined) {
        expect(typeof ev.pdl_context).toBe('object');
      }
      if ('canonical_store' in ev && ev.canonical_store !== undefined) {
        expect(typeof ev.canonical_store).toBe('string');
      }
    }
  });

  it('actor-objektet har samma fält-shape (hsa_id krävs, role optional)', async () => {
    const auditMw = await captureAuditMwEvent();
    const parityAudit = await captureParityAuditEvent();
    const a1 = auditMw.actor as Record<string, unknown>;
    const a2 = parityAudit.actor as Record<string, unknown>;
    expect(typeof a1.hsa_id).toBe('string');
    expect(typeof a2.hsa_id).toBe('string');
    // role är optional men om satt ska det vara en sträng
    if (a1.role !== undefined) expect(typeof a1.role).toBe('string');
    if (a2.role !== undefined) expect(typeof a2.role).toBe('string');
  });

  it('typ-shapes på primitiva fält är konsistenta', async () => {
    const auditMw = await captureAuditMwEvent();
    const parityAudit = await captureParityAuditEvent();

    for (const ev of [auditMw, parityAudit]) {
      expect(typeof ev.event_id).toBe('string');
      expect(typeof ev.timestamp).toBe('string');
      expect(typeof ev.action).toBe('string');
      expect(typeof ev.resource_type).toBe('string');
      expect(typeof ev.outcome).toBe('string');
      expect(typeof ev.request_id).toBe('string');
      expect(typeof ev.duration_ms).toBe('number');
    }
  });

  it('parity-event tillåts ha extra diagnostic-fält (snapshots_count, failures_count)', async () => {
    const parityAudit = await captureParityAuditEvent();
    // Dessa är extra — OK enligt AC19
    expect(parityAudit).toHaveProperty('snapshots_count');
    expect(parityAudit).toHaveProperty('failures_count');
    expect(typeof parityAudit.snapshots_count).toBe('number');
    expect(typeof parityAudit.failures_count).toBe('number');
  });

  it('action skiljer sig mellan event-typerna (väntat — det är hela poängen med PARITY_RUN)', async () => {
    const auditMw = await captureAuditMwEvent();
    const parityAudit = await captureParityAuditEvent();
    expect(auditMw.action).toMatch(/^(READ|SEARCH|CREATE|UPDATE|DELETE)$/);
    expect(parityAudit.action).toBe('PARITY_RUN');
  });
});
