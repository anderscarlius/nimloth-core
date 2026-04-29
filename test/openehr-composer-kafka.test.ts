// Kafka-end-to-end-tester (Sprint 2 P3.2).
//
// Förutsättningar:
//   docker compose up -d kafka core-db ehrbase-db ehrbase openehr-composer
//   pnpm openehr:load-templates
//
// Default host-portar (override.yml aktiv):
//   Kafka 14092 → broker (PLAINTEXT_HOST), composer 13015, EHRbase 18088
//
// Kör: pnpm --filter @nimloth-core/e2e exec vitest run openehr-composer-kafka.test.ts

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Kafka, type Producer } from 'kafkajs';

const COMPOSER_URL = process.env.COMPOSER_URL || 'http://localhost:13015';
const KAFKA_BROKERS = (process.env.KAFKA_BROKERS_HOST || 'localhost:14092').split(',');
const PNR = '19500315-2384';

let kafka: Kafka;
let producer: Producer;

async function waitFor<T>(fn: () => Promise<T | null>, label: string, timeoutMs = 20_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await fn();
    if (r != null) return r;
    await new Promise((res) => setTimeout(res, 500));
  }
  throw new Error(`waitFor timeout: ${label}`);
}

async function fetchOutbox(eventId: string): Promise<{ status: string; composition_uid: string | null } | null> {
  const r = await fetch(`${COMPOSER_URL}/composer/outbox?limit=200`);
  if (!r.ok) return null;
  const body = (await r.json()) as { rows: Array<{ event_id: string; status: string; composition_uid: string | null }> };
  return body.rows.find((row) => row.event_id === eventId) ?? null;
}

async function sendEvent(topic: string, eventId: string, eventType: string, payload: Record<string, unknown>): Promise<void> {
  const event = {
    event_id: eventId,
    event_type: eventType,
    patient_pnr: PNR,
    source_system: 'kafka-e2e-test',
    occurred_at: new Date().toISOString(),
    payload,
  };
  await producer.send({
    topic,
    messages: [{ key: PNR, value: JSON.stringify(event) }],
  });
}

beforeAll(async () => {
  // Vänta in composer
  let attempts = 30;
  while (attempts-- > 0) {
    try {
      const r = await fetch(`${COMPOSER_URL}/composer/health`);
      if (r.ok) break;
    } catch {
      /* swallow */
    }
    await new Promise((res) => setTimeout(res, 1_500));
  }
  if (attempts <= 0) throw new Error(`composer ej tillgänglig på ${COMPOSER_URL}`);

  kafka = new Kafka({ clientId: 'kafka-e2e-test', brokers: KAFKA_BROKERS });
  producer = kafka.producer();
  await producer.connect();
}, 60_000);

afterAll(async () => {
  await producer?.disconnect().catch(() => undefined);
});

// ============================================================
// 1. kafka_consumer_writes_to_outbox
// ============================================================
describe('Kafka consumer → outbox', () => {
  it('event publicerat till core.clinical.observation.vitals hamnar i outbox inom 10s', async () => {
    const eventId = randomUUID();
    await sendEvent(
      'core.clinical.observation.vitals',
      eventId,
      'core.clinical.observation.vitals.body_temperature',
      { value: 37.2, units: '°C' },
    );

    const row = await waitFor(() => fetchOutbox(eventId), 'outbox-row för Kafka-event', 10_000);
    expect(row).toBeDefined();
    expect(['pending', 'processing', 'completed']).toContain(row.status);
  }, 30_000);
});

// ============================================================
// 2. outbox_idempotency_via_kafka
// ============================================================
describe('Outbox idempotency på event_id', () => {
  it('samma event_id skickat två gånger ger en outbox-rad', async () => {
    const eventId = randomUUID();
    const eventType = 'core.clinical.observation.vitals.pulse';
    const payload = { value: 75, units: '/min' };

    await sendEvent('core.clinical.observation.vitals', eventId, eventType, payload);
    await new Promise((res) => setTimeout(res, 500));
    await sendEvent('core.clinical.observation.vitals', eventId, eventType, payload);

    // Vänta in outbox-bearbetning
    await new Promise((res) => setTimeout(res, 5_000));

    const r = await fetch(`${COMPOSER_URL}/composer/outbox?limit=200`);
    const body = (await r.json()) as { rows: Array<{ event_id: string }> };
    const matches = body.rows.filter((row) => row.event_id === eventId);
    expect(matches.length).toBe(1);
  }, 30_000);
});

// ============================================================
// 3. outbox_processor_creates_composition (end-to-end EHRbase)
// ============================================================
describe('Outbox processor → EHRbase composition', () => {
  it('vitals-event → composition skapas, outbox markeras completed', async () => {
    const eventId = randomUUID();
    await sendEvent(
      'core.clinical.observation.vitals',
      eventId,
      'core.clinical.observation.vitals.body_temperature',
      { value: 38.1, units: '°C' },
    );

    const row = await waitFor(
      async () => {
        const r = await fetchOutbox(eventId);
        return r?.status === 'completed' ? r : null;
      },
      'outbox-row markeras completed',
      30_000,
    );
    expect(row.status).toBe('completed');
    expect(row.composition_uid).toMatch(/^[0-9a-f-]{36}::/);
  }, 60_000);
});

// ============================================================
// 4. failed_event_marked_after_max_attempts (gap-events flyttas till skipped)
// ============================================================
describe('Outbox skipped för known gaps', () => {
  it('medication.prescribed → status=skipped (P3.0b-blocker)', async () => {
    const eventId = randomUUID();
    await sendEvent(
      'core.clinical.medication.prescribed',
      eventId,
      'core.clinical.medication.prescribed',
      { drug: 'Warfarin', dose: '5mg' },
    );

    const row = await waitFor(
      async () => {
        const r = await fetchOutbox(eventId);
        return r?.status === 'skipped' ? r : null;
      },
      'outbox skipped för gap-event',
      30_000,
    );
    expect(row.status).toBe('skipped');
  }, 60_000);
});

// ============================================================
// 5. fru_andersson_full_sequence
// ============================================================
describe('Fru Andersson full sequence via Kafka', () => {
  it('6-event akutankomst: 4 composed + 2 skipped', async () => {
    const startStatsR = await fetch(`${COMPOSER_URL}/composer/outbox/stats`);
    const startStats = (await startStatsR.json()) as { by_status: Array<{ status: string; count: number }> };
    const initialCompleted = startStats.by_status.find((s) => s.status === 'completed')?.count ?? 0;
    const initialSkipped = startStats.by_status.find((s) => s.status === 'skipped')?.count ?? 0;

    // Skicka 6 events
    const events = [
      { topic: 'core.clinical.observation.vitals', type: 'core.clinical.observation.vitals.body_temperature', payload: { value: 38.4, units: '°C' } },
      { topic: 'core.clinical.observation.vitals', type: 'core.clinical.observation.vitals.blood_pressure', payload: { value: 165, units: 'mm[Hg]' } },
      { topic: 'core.clinical.observation.vitals', type: 'core.clinical.observation.vitals.pulse', payload: { value: 98, units: '/min' } },
      { topic: 'core.clinical.procedure.completed', type: 'core.clinical.procedure.completed', payload: { description: 'Höftledsprotes höger (akut)' } },
      { topic: 'core.clinical.medication.prescribed', type: 'core.clinical.medication.prescribed', payload: { drug: 'Warfarin', dose: '5mg' } },
      { topic: 'core.clinical.medication.prescribed', type: 'core.clinical.medication.prescribed', payload: { drug: 'Metoprolol', dose: '50mg' } },
    ];
    const ids: string[] = [];
    for (const e of events) {
      const id = randomUUID();
      ids.push(id);
      await sendEvent(e.topic, id, e.type, e.payload);
    }

    // Vänta in outbox-processing (3-5s extra för 6 events × processor-batch)
    await new Promise((res) => setTimeout(res, 8_000));

    const finalStatsR = await fetch(`${COMPOSER_URL}/composer/outbox/stats`);
    const finalStats = (await finalStatsR.json()) as { by_status: Array<{ status: string; count: number }> };
    const finalCompleted = finalStats.by_status.find((s) => s.status === 'completed')?.count ?? 0;
    const finalSkipped = finalStats.by_status.find((s) => s.status === 'skipped')?.count ?? 0;

    expect(finalCompleted - initialCompleted).toBeGreaterThanOrEqual(4);
    expect(finalSkipped - initialSkipped).toBeGreaterThanOrEqual(2);
  }, 60_000);
});

// ============================================================
// 6. composer_stats_includes_kafka_metrics
// ============================================================
describe('Composer stats inkluderar Kafka + outbox-metrics', () => {
  it('/composer/stats returnerar kafka.running + outbox-stats', async () => {
    const r = await fetch(`${COMPOSER_URL}/composer/stats`);
    expect(r.ok).toBe(true);
    const body = (await r.json()) as {
      kafka: { running: boolean; consumedTotal: number };
      outbox: { by_status: Array<{ status: string }>; metrics: { processedTotal: number } };
    };
    expect(body.kafka.running).toBe(true);
    expect(body.kafka.consumedTotal).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(body.outbox.by_status)).toBe(true);
    expect(typeof body.outbox.metrics.processedTotal).toBe('number');
  });
});
