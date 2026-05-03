// Materializer-tester (Sprint 2.5 B1).
//
// Regression-test för NOT NULL-violation på patient_pnr när events kommer
// från kafka-test-producer (skickar `patient_pnr` istället för `patient_id`).
//
// Materializer-klassen är Kafka-bunden så vi kan inte testa hela
// dispatch-flödet utan en Kafka-broker. Däremot kan vi (a) instansiera
// klassen med en mock-pool, (b) köra dispatchClinical via en prototypiskt
// publicerad shim, eller (c) testa extractPnr/extractTimestamp som
// rena helpers genom att importera dem.
//
// För regressions-fokus väljer vi (b): vi använder bracket-access
// (`m['dispatchClinical']`) för att kalla den private metoden direkt. Det
// är medvetet val — alternativet är att exportera helpers separat, vilket
// är scope-creep i en bug-fix-test. Vitest tillåter detta utan TS-bråk
// via `as unknown as` på instansen.

import { describe, expect, it, beforeEach, vi } from 'vitest';
import pino from 'pino';
import type pg from 'pg';
import { Materializer } from '../materializer.js';
import type { FhirFacadeConfig } from '../config.js';

interface CapturedQuery {
  sql: string;
  params: unknown[];
}

function makeFakePool(): { pool: pg.Pool; queries: CapturedQuery[] } {
  const queries: CapturedQuery[] = [];
  const pool = {
    query: async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params: params ?? [] });
      return { rows: [] };
    },
  } as unknown as pg.Pool;
  return { pool, queries };
}

function makeMaterializer(): { m: Materializer; queries: CapturedQuery[]; warnSpy: ReturnType<typeof vi.fn> } {
  const { pool, queries } = makeFakePool();
  // Riktig pino-instans + spy på warn för skip-event-verifiering. Att mocka
  // hela Logger-objektet bråkar med pino:s typegeneric i strict tsc (Docker
  // build failade på OnChildCallback<string> vs <never>); vi.spyOn är säkrare.
  const logger = pino({ level: 'silent' });
  const warnSpy = vi.fn();
  logger.warn = warnSpy as unknown as typeof logger.warn;
  const config: FhirFacadeConfig = {
    instanceId: 'test',
    mode: 'primary',
    port: 3003,
    kafka: { brokers: ['localhost:9092'], clientId: 'test', groupId: 'test' },
    db: { host: 'x', port: 5432, database: 'x', user: 'x', password: 'x' },
    logLevel: 'silent',
    clinicalTopics: [],
    canonicalStore: 'postgres',
    ehrbaseUrl: 'http://x',
  };
  const m = new Materializer(config, pool, logger);
  return { m, queries, warnSpy };
}

/** Kalla privata dispatchClinical via bracket-access. Test-only helper. */
async function dispatch(m: Materializer, topic: string, event: unknown): Promise<void> {
  const obj = m as unknown as { dispatchClinical: (t: string, e: unknown) => Promise<void> };
  await obj.dispatchClinical(topic, event);
}

describe('Materializer dual-key-läsning (Sprint 2.5 B1)', () => {
  let m: Materializer;
  let queries: CapturedQuery[];
  let warnSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const setup = makeMaterializer();
    m = setup.m;
    queries = setup.queries;
    warnSpy = setup.warnSpy;
  });

  it('REGRESSION: kafka-test-producer-event med patient_pnr (inte patient_id) materialiseras till FHIR-tabell', async () => {
    // Detta är exakt event-shape som kafka-test-producer:s
    // medicationPrescribedEvent() producerar (P3.2-fixture).
    const event = {
      event_id: '11111111-1111-4111-8111-111111111111',
      event_type: 'core.clinical.medication.prescribed',
      patient_pnr: '19500315-2384', // ← INTE patient_id
      source_system: 'kafka-test-producer',
      occurred_at: '2026-05-03T10:00:00Z',
      payload: { drug: 'Warfarin', dose: '5mg' },
    };
    await dispatch(m, 'core.clinical.medication.prescribed', event);
    expect(queries).toHaveLength(1);
    expect(queries[0].sql).toContain('INSERT INTO fhir_medication_statements');
    // patient_pnr-värdet ska vara extraherat från event.patient_pnr
    expect(queries[0].params[1]).toBe('19500315-2384');
  });

  it('production-event med patient_id (inte patient_pnr) fortsätter fungera', async () => {
    // Transform/-output har historiskt använt patient_id direkt.
    const event = {
      event_id: '22222222-2222-4222-8222-222222222222',
      event_type: 'core.clinical.observation.vitals',
      patient_id: '19500315-2384',
      source_system: 'transform',
      timestamp: '2026-05-03T10:01:00Z',
      payload: {
        recorded_at: '2026-05-03T10:00:00Z',
        values: [{ code: '8310-5', display: 'Body temp', value: 38.4, unit: '°C', system: 'http://loinc.org' }],
      },
    };
    await dispatch(m, 'core.clinical.observation.vitals', event);
    expect(queries).toHaveLength(1);
    expect(queries[0].sql).toContain('INSERT INTO fhir_observations');
    expect(queries[0].params[1]).toBe('19500315-2384');
  });

  it('event helt utan patient_id/patient_pnr ⇒ skipp + warn (ingen NOT NULL-violation)', async () => {
    const brokenEvent = {
      event_id: '33333333-3333-4333-8333-333333333333',
      event_type: 'core.clinical.medication.prescribed',
      // varken patient_id ELLER patient_pnr
      source_system: 'broken-producer',
      timestamp: '2026-05-03T10:02:00Z',
      payload: { drug: 'Metoprolol', dose: '50mg' },
    };
    await dispatch(m, 'core.clinical.medication.prescribed', brokenEvent);
    // INGA queries — eventet skippades innan INSERT
    expect(queries).toHaveLength(0);
    // ETT warn-loggmeddelande
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][1]).toContain('saknar patient_id/patient_pnr');
  });

  it('alla 6 dispatchade resurstyper accepterar patient_pnr-format', async () => {
    const cases: Array<{ topic: string; event_type: string; payload?: Record<string, unknown>; tableName: string }> = [
      { topic: 'core.clinical.encounter.started', event_type: 'enc', tableName: 'fhir_encounters' },
      { topic: 'core.clinical.observation.vitals', event_type: 'obs', tableName: 'fhir_observations' },
      { topic: 'core.clinical.lab.result', event_type: 'lab', tableName: 'fhir_observations' },
      { topic: 'core.clinical.medication.prescribed', event_type: 'med', tableName: 'fhir_medication_statements' },
      { topic: 'core.clinical.procedure.completed', event_type: 'proc', tableName: 'fhir_procedures' },
      { topic: 'core.clinical.condition.diagnosed', event_type: 'cond', tableName: 'fhir_conditions' },
      { topic: 'core.clinical.allergy.reported', event_type: 'allergy', tableName: 'fhir_allergy_intolerances' },
    ];
    for (const c of cases) {
      const setup = makeMaterializer();
      const event = {
        event_id: `aaaa-${c.event_type}`,
        event_type: c.event_type,
        patient_pnr: '19500315-2384',
        source_system: 'kafka-test-producer',
        occurred_at: '2026-05-03T10:00:00Z',
        payload: c.payload ?? {},
      };
      await dispatch(setup.m, c.topic, event);
      expect(setup.queries).toHaveLength(1);
      expect(setup.queries[0].sql).toContain(`INSERT INTO ${c.tableName}`);
      expect(setup.queries[0].params[1]).toBe('19500315-2384');
    }
  });
});
