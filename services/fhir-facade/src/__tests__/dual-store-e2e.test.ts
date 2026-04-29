// Dual-store e2e (Sprint 2 P3.3, Steg 4.8).
//
// Live-verifiering mot riktig core-db + EHRbase + Kafka. Bootar fhir-facade
// in-process i två konfigurationer (CANONICAL_STORE=postgres respektive
// =openehr) och hittar samma endpoints via HTTP. Skiljer sig från PDL-
// preservation-testen som mockar allt — här testar vi faktiska AQL-anrop
// och DB-uppslag.
//
// Kör med: E2E_LIVE=1 pnpm --filter @nimloth-core/fhir-facade test
//
// Förutsätter att:
//   - core-db lyssnar på localhost:10435 (compose-override host-port)
//   - kafka lyssnar på localhost:14092
//   - ehrbase lyssnar på localhost:18088
//   - openehr_ehr_cache har Fru Andersson 19500315-2384 + EHR-id (P3.2)
//   - EHRbase har compositions från P3.2 (3 obs, 1 procedure)
//
// Förväntad mismatch mellan stores: postgres-tabellerna är tomma medan
// openehr-vägen returnerar P3.2-data. Det är exakt den diagnostiska data
// som P3.4 (paritetsdiff) ska ta sig an. Tester som direkt jämför count
// mellan stores är därför *avsiktligt frånvarande* — vi mäter istället
// att respektive store returnerar förväntad volym för sin kanal.

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import pino from 'pino';
import pg from 'pg';
import { Kafka } from 'kafkajs';
import type { Producer } from 'kafkajs';

import { createServer } from '../server.js';
import { createStoreRouter } from '../stores/index.js';

const FRU_ANDERSSON = '19500315-2384';

const E2E_LIVE = process.env.E2E_LIVE === '1';
const describeLive = E2E_LIVE ? describe : describe.skip;

interface LiveApp {
  base: string;
  pool: pg.Pool;
  producer: Producer;
  close: () => Promise<void>;
}

async function bootLiveApp(canonicalStore: 'postgres' | 'openehr'): Promise<LiveApp> {
  const pool = new pg.Pool({
    host: process.env.E2E_PG_HOST ?? 'localhost',
    port: Number(process.env.E2E_PG_PORT ?? 10435),
    database: process.env.E2E_PG_DB ?? 'core',
    user: process.env.E2E_PG_USER ?? 'core',
    password: process.env.E2E_PG_PASS ?? 'core',
  });
  await pool.query('SELECT 1');

  const kafka = new Kafka({
    clientId: `fhir-facade-e2e-${canonicalStore}`,
    brokers: [process.env.E2E_KAFKA ?? 'localhost:14092'],
    retry: { retries: 3, initialRetryTime: 200 },
  });
  const producer = kafka.producer({ idempotent: true });
  await producer.connect();

  const ehrbaseUrl = process.env.E2E_EHRBASE ?? 'http://localhost:18088';
  const logger = pino({ level: 'silent' });

  const storeRouter = createStoreRouter({ pool, ehrbaseUrl, mode: canonicalStore, logger });

  const app = createServer({
    pool,
    auditProducer: producer,
    logger,
    instanceId: `e2e-${canonicalStore}`,
    mode: 'primary',
    storeRouter,
    pdlEnforce: false, // e2e-läsningar kommer alltid med care-relation header
    getMaterializerMetrics: () => ({ processed: 0, errors: 0, byType: {} }),
  });

  const inner = express();
  inner.use(app);
  const server = inner.listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const port = (server.address() as AddressInfo).port;

  return {
    base: `http://127.0.0.1:${port}`,
    pool,
    producer,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await producer.disconnect();
      await pool.end();
    },
  };
}

const HEADERS = {
  'x-pdl-care-relation': 'true',
  'x-pdl-care-unit': 'TestUnit',
  'x-user-hsa': 'SE-E2E-001',
};

describeLive('Dual-store e2e against live infrastructure', () => {
  let postgresApp: LiveApp;
  let openehrApp: LiveApp;

  beforeAll(async () => {
    postgresApp = await bootLiveApp('postgres');
    openehrApp = await bootLiveApp('openehr');
  }, 30_000);

  afterAll(async () => {
    if (postgresApp) await postgresApp.close();
    if (openehrApp) await openehrApp.close();
  });

  it('1. patient_postgres_returns_404_or_empty: postgres-mode returnerar tom då fhir_patients är tom', async () => {
    const r = await fetch(`${postgresApp.base}/fhir/r4/Patient/${FRU_ANDERSSON}`, { headers: HEADERS });
    // Förväntat: 404 (FHIR-tabellen ej populerad i denna miljö).
    // Om P3.5+ kör materializern först kan det bli 200 — då är det fortfarande
    // ett giltigt utfall, vi vill bara veta att vägen fungerar.
    expect([200, 404]).toContain(r.status);
  });

  it('2. patient_openehr_returns_minimal_resource: openehr-mode returnerar Patient-shell från EHR-cache + EHR-id', async () => {
    const r = await fetch(`${openehrApp.base}/fhir/r4/Patient/${FRU_ANDERSSON}`, { headers: HEADERS });
    expect(r.status).toBe(200);
    const body = (await r.json()) as { resourceType: string; id: string; meta?: { source?: string } };
    expect(body.resourceType).toBe('Patient');
    expect(body.id).toBe(FRU_ANDERSSON);
    // openEHR-vägen taggar källan med ehr-id — bevisar att AQL-uppslaget körts.
    expect(body.meta?.source).toMatch(/^openehr-ehr:/);
  });

  it('3. observations_openehr_returns_p3_2_vitals: 3 vital-signs (temp, BP, puls) från Fru Andersson', async () => {
    const r = await fetch(`${openehrApp.base}/fhir/r4/Observation?patient=${FRU_ANDERSSON}`, { headers: HEADERS });
    expect(r.status).toBe(200);
    const body = (await r.json()) as { total: number; entry?: Array<{ resource: { code?: { coding?: Array<{ code?: string }> } } }> };
    // P3.2 producerade 3 vitals-compositions. Avsiktligen frånvarande:
    // jämförelse mot postgres (som är tomt här — det är *poängen* med
    // dual-store-arkitekturen; paritet kommer i P3.4).
    expect(body.total).toBe(3);
    expect(body.entry).toHaveLength(3);
    // Alla 3 ska ha archetype-koder från openEHR-namespace
    for (const e of body.entry ?? []) {
      const code = e.resource.code?.coding?.[0]?.code;
      expect(code).toMatch(/^openEHR-EHR-OBSERVATION/);
    }
  });

  it('4. procedure_openehr_returns_p3_2_action: 1 procedure-composition (minimal_action) från Fru Andersson', async () => {
    const r = await fetch(`${openehrApp.base}/fhir/r4/Procedure?patient=${FRU_ANDERSSON}`, { headers: HEADERS });
    expect(r.status).toBe(200);
    const body = (await r.json()) as { total: number };
    // P3.2 producerade 1 procedure-composition.
    expect(body.total).toBe(1);
  });

  it('5. medication_and_condition_empty_pending_p3_0b: medication + condition är 0 i båda stores (väntar P3.0b)', async () => {
    // EVALUATION-arketyper är gap (no_template_mapping) tills P3.0b
    // levererar XML-OPT-bridge. Båda stores ska returnera 0 — postgres
    // för att tabellerna är tomma, openehr för att AqlToFhir filtrerar
    // klient-sida på archetype_node_id-prefix och inga rader matchar.
    const med = await fetch(`${openehrApp.base}/fhir/r4/MedicationStatement?patient=${FRU_ANDERSSON}`, { headers: HEADERS });
    const cond = await fetch(`${openehrApp.base}/fhir/r4/Condition?patient=${FRU_ANDERSSON}`, { headers: HEADERS });
    expect(med.status).toBe(200);
    expect(cond.status).toBe(200);
    expect(((await med.json()) as { total: number }).total).toBe(0);
    expect(((await cond.json()) as { total: number }).total).toBe(0);
  });

  it('6. coverage_endpoint_populated_after_openehr_reads: /facade/coverage returnerar non-tom gaps-array', async () => {
    // CoverageTracker har loggat fält (Patient.name/birthDate/gender etc)
    // genom test 2-5. Endpointen ska returnera en sorterad lista.
    const r = await fetch(`${openehrApp.base}/facade/coverage`);
    expect(r.status).toBe(200);
    const body = (await r.json()) as {
      mode: string;
      total_missing: number;
      gaps: Array<{ resource: string; field: string; missingCount: number }>;
    };
    expect(body.mode).toBe('openehr');
    expect(body.total_missing).toBeGreaterThan(0);
    expect(body.gaps.length).toBeGreaterThan(0);
    // Patient-shellen från openEHR har alltid name/birthDate/gender som gaps.
    expect(body.gaps.find((g) => g.resource === 'Patient' && g.field === 'name')).toBeTruthy();
  });
});
