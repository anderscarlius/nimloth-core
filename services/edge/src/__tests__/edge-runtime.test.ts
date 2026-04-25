// Vitest-tester för edge-nod runtime.
// Testar FHIR-cache, offline-detector, sync-state utan att behöva Kafka live.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import pino from 'pino';
import { FhirCache } from '../fhir-cache.js';
import { OfflineDetector } from '../offline-detector.js';
import { createFhirServer } from '../fhir-server.js';
import { createCdsServer } from '../cds-server.js';
import type { EdgeConfig } from '../config.js';

const logger = pino({ level: 'silent' });

function makeConfig(): EdgeConfig {
  return {
    instanceId: 'su',
    instanceName: 'Melior SU',
    hospitalName: 'Sahlgrenska Universitetssjukhuset',
    hsaId: 'SE2321000131-E000000000001',
    logLevel: 'silent',
    localKafka: { brokers: ['localhost:29092'], clientId: 'test' },
    centralKafka: { brokers: ['localhost:19092'], clientId: 'test' },
    centralHub: {
      fhirBaseUrl: 'http://localhost:19999',
      healthUrl: 'http://localhost:19999/health',
    },
    fhirCache: { sqlitePath: ':memory:' },
    ports: { fhir: 0, cds: 0, status: 0 },
    offline: { pingIntervalMs: 50, pingTimeoutMs: 20, maxRetries: 3, syncBatchSize: 100 },
    hydration: { kafkaSnapshotTimeoutMs: 5_000, httpFallbackEnabled: false },
  };
}

describe('FhirCache', () => {
  let cache: FhirCache;
  beforeEach(() => {
    cache = new FhirCache(':memory:', logger);
  });
  afterEach(() => cache.close());

  it('upsertar patient och läser tillbaka den', () => {
    cache.upsertPatient({
      personnummer: '19500315-2384',
      fornamn: 'Ingrid',
      efternamn: 'Andersson',
      fodelsedatum: '1950-03-15',
      kon: 'K',
    });
    const row = cache.findPatientByPnr('19500315-2384');
    expect(row).not.toBeNull();
    expect(row?.fornamn).toBe('Ingrid');
    expect(row?.efternamn).toBe('Andersson');
    expect(cache.patientCount()).toBe(1);
  });

  it('lagrar medication och returnerar i $everything', () => {
    cache.upsertPatient({ personnummer: '19500315-2384' });
    cache.upsertMedication({
      event_id: 'm1',
      patient_id: '19500315-2384',
      medication: { atc_code: 'B01AA03', drug_name: 'Waran', strength: '2.5 mg' },
    });
    const bundle = cache.queryPatientEverything('19500315-2384');
    expect(bundle.medications).toHaveLength(1);
    expect(bundle.medications[0].atc_code).toBe('B01AA03');
    expect(bundle.medications[0].drug_name).toBe('Waran');
  });

  it('sparar implantatdata i procedure', () => {
    cache.upsertPatient({ personnummer: '19500315-2384' });
    cache.upsertProcedure({
      event_id: 'p1',
      patient_id: '19500315-2384',
      procedure: {
        code: 'NFB49',
        display: 'Total höftprotesplastik höger',
        implant: {
          manufacturer: 'Zimmer Biomet',
          model: 'Avenir Complete',
          size: '52mm',
        },
      },
    });
    const rows = cache.queryPatientEverything('19500315-2384').procedures;
    expect(rows[0].implant_manufacturer).toBe('Zimmer Biomet');
    expect(rows[0].implant_model).toBe('Avenir Complete');
  });

  it('isBlocked fungerar med spärregister', () => {
    cache.upsertBlockedPatient('19500315-2384', 'SE-HSA-1');
    expect(cache.isBlocked('19500315-2384', 'SE-HSA-1')).toBe(true);
    expect(cache.isBlocked('19500315-2384', 'SE-HSA-X')).toBe(false);
  });
});

describe('OfflineDetector', () => {
  let detector: OfflineDetector;
  afterEach(() => detector?.stop());

  it('emittar offline efter 3 missade pingar', async () => {
    detector = new OfflineDetector(
      {
        centralHealthUrl: 'http://127.0.0.1:1', // garanterat ner
        pingIntervalMs: 30,
        pingTimeoutMs: 10,
        maxRetries: 3,
      },
      logger,
    );
    const offlineEvent = new Promise<void>((resolve) => detector.on('offline', () => resolve()));
    detector.start();
    await offlineEvent;
    const status = detector.getStatus();
    expect(status.online).toBe(false);
    expect(status.missedPings).toBeGreaterThanOrEqual(3);
  }, 5000);

  it('emittar reconnected efter lyckad ping när offline', async () => {
    detector = new OfflineDetector(
      {
        centralHealthUrl: 'http://127.0.0.1:1',
        pingIntervalMs: 50,
        pingTimeoutMs: 10,
        maxRetries: 1,
      },
      logger,
    );
    detector.start();
    await new Promise((r) => setTimeout(r, 200));
    expect(detector.getStatus().online).toBe(false);

    // Mocka fetch till OK
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true } as Response);

    const reconnected = new Promise<void>((resolve) => detector.on('reconnected', () => resolve()));
    await detector.ping();
    await reconnected;
    expect(detector.getStatus().online).toBe(true);

    globalThis.fetch = originalFetch;
  }, 5000);
});

describe('SyncState via markBuffered', () => {
  it('markerar buffering-mode och räknar upp bufferedEvents', async () => {
    // Vi testar inte hela SyncManager mot en riktig Kafka — endast state-övergången.
    const { SyncManager } = await import('../sync-manager.js');
    const detector = new OfflineDetector(
      { centralHealthUrl: 'http://127.0.0.1:1', pingIntervalMs: 1000, pingTimeoutMs: 10, maxRetries: 3 },
      logger,
    );
    const cache = new FhirCache(':memory:', logger);
    const sync = new SyncManager({ config: makeConfig(), cache, detector, logger });
    expect(sync.getState().bufferedEvents).toBe(0);
    sync.markBuffered(5);
    expect(sync.getState().bufferedEvents).toBe(5);
    expect(sync.getState().mode).toBe('buffering');
    cache.close();
  });
});

describe('Edge FHIR server (replica) — smoke', () => {
  it('listar patient via identifier', async () => {
    const cache = new FhirCache(':memory:', logger);
    cache.upsertPatient({
      personnummer: '19500315-2384',
      fornamn: 'Ingrid',
      efternamn: 'Andersson',
      kon: 'K',
    });
    const app = createFhirServer({ config: makeConfig(), cache, logger });
    const server = app.listen(0);
    const port = (server.address() as { port: number }).port;

    const res = await fetch(`http://127.0.0.1:${port}/fhir/r4/Patient?identifier=19500315-2384`, {
      headers: {
        'X-User-HSA': 'SE-TEST',
        'X-User-Role': 'PHYSICIAN',
        'X-PDL-Care-Relation': 'true',
        'X-PDL-Purpose': 'CARE',
        'X-PDL-Care-Unit': 'SE-TEST-UNIT',
      },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { total: number; entry: Array<{ resource: { name?: unknown } }> };
    expect(body.total).toBe(1);
    expect(body.entry[0].resource.name).toBeDefined();

    // utan PDL-headers → 403
    const forbidden = await fetch(`http://127.0.0.1:${port}/fhir/r4/Patient?identifier=19500315-2384`);
    expect(forbidden.status).toBe(403);

    server.close();
    cache.close();
  });
});

describe('Edge CDS server — Fru Andersson', () => {
  it('returnerar critical card för antikoagulation när Waran finns', async () => {
    const cache = new FhirCache(':memory:', logger);
    cache.upsertPatient({ personnummer: '19500315-2384', fornamn: 'Ingrid' });
    cache.upsertMedication({
      event_id: 'm1',
      patient_id: '19500315-2384',
      medication: { atc_code: 'B01AA03', drug_name: 'Waran', strength: '2.5 mg' },
    });

    const app = createCdsServer({ config: makeConfig(), cache, logger });
    const server = app.listen(0);
    const port = (server.address() as { port: number }).port;

    const res = await fetch(`http://127.0.0.1:${port}/cds-services/core-anticoagulation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hookInstance: 't',
        hook: 'patient-view',
        context: { userId: 'Practitioner/1', patientId: 'Patient/19500315-2384' },
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { cards: Array<{ indicator: string; summary: string }> };
    expect(body.cards.length).toBeGreaterThan(0);
    expect(body.cards[0].indicator).toBe('critical');
    expect(body.cards[0].summary).toMatch(/antikoagul/i);

    server.close();
    cache.close();
  });
});
