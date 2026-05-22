// openehr-composer end-to-end smoke-tester (Sprint 2 P3.1).
//
// Förutsättningar:
//   docker compose up -d core-db ehrbase-db ehrbase openehr-composer
//   pnpm openehr:load-templates
//
// Default host-portar (override.yml aktiv):
//   EHRbase 18088, openehr-composer 13015
//
// Kör: pnpm --filter @nimloth-core/e2e exec vitest run openehr-composer.test.ts

import { describe, expect, it, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';

const COMPOSER_URL = process.env.COMPOSER_URL || 'http://localhost:13015';
const EHRBASE_URL = process.env.EHRBASE_URL || 'http://localhost:18088';

const PNR = `19500315-2384`; // Fru Andersson

describe('openehr-composer — health + setup', () => {
  beforeAll(async () => {
    let attempts = 30;
    while (attempts-- > 0) {
      try {
        const r = await fetch(`${COMPOSER_URL}/composer/health`);
        if (r.ok) return;
      } catch {
        /* swallow */
      }
      await new Promise((r) => setTimeout(r, 1_500));
    }
    throw new Error(`openehr-composer ej tillgänglig på ${COMPOSER_URL}`);
  }, 60_000);

  it('/composer/health returnerar status=ok', async () => {
    const r = await fetch(`${COMPOSER_URL}/composer/health`);
    expect(r.ok).toBe(true);
    const body = (await r.json()) as { status: string; service: string };
    expect(body.status).toBe('ok');
    expect(body.service).toBe('openehr-composer');
  });

  it('/composer/templates listar mappings + EHRbase-loaded', async () => {
    const r = await fetch(`${COMPOSER_URL}/composer/templates`);
    expect(r.ok).toBe(true);
    const body = (await r.json()) as {
      mappings: Array<{ event_type: string; templateId: string }>;
      known_gaps: string[];
      ehrbase: { loaded: Array<{ template_id: string }>; error: string | null };
    };
    expect(body.mappings.length).toBeGreaterThanOrEqual(4);
    const eventTypes = new Set(body.mappings.map((m) => m.event_type));
    expect(eventTypes.has('core.clinical.observation.vitals.body_temperature')).toBe(true);
    expect(eventTypes.has('core.clinical.procedure.completed')).toBe(true);
    expect(body.known_gaps.length).toBeGreaterThanOrEqual(3);
    expect(body.ehrbase.error).toBeNull();
  });
});

describe('openehr-composer — EHR cache', () => {
  it('skapar EHR första gången och returnerar samma ehr_id andra gången', async () => {
    const pnr = `19500101-${Math.floor(Math.random() * 9000 + 1000)}`;

    const first = await fetch(`${COMPOSER_URL}/composer/ehr/${pnr}`).then((r) => r.json()) as {
      ehr_id: string;
      created: boolean;
    };
    expect(first.created).toBe(true);
    expect(first.ehr_id).toMatch(/^[0-9a-f-]{36}$/);

    const second = await fetch(`${COMPOSER_URL}/composer/ehr/${pnr}`).then((r) => r.json()) as {
      ehr_id: string;
      created: boolean;
    };
    expect(second.created).toBe(false);
    expect(second.ehr_id).toBe(first.ehr_id);
  });
});

describe('openehr-composer — body_temperature event end-to-end', () => {
  let ehrId: string;
  let compositionUid: string;

  it('POST /composer/event för body_temperature → composed', async () => {
    const r = await fetch(`${COMPOSER_URL}/composer/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_id: randomUUID(),
        event_type: 'core.clinical.observation.vitals.body_temperature',
        patient_pnr: PNR,
        source_system: 'e2e-test',
        occurred_at: '2026-04-28T08:00:00Z',
        payload: { value: 37.2, units: '°C' },
      }),
    });
    expect(r.status).toBe(201);
    const body = (await r.json()) as {
      status: string;
      ehr_id: string;
      composition_uid: string;
      template_id: string;
    };
    expect(body.status).toBe('composed');
    expect(body.template_id).toBe('time_series.en.v1');
    expect(body.composition_uid).toMatch(/^[0-9a-f-]{36}::/);
    ehrId = body.ehr_id;
    compositionUid = body.composition_uid;
  });

  it('AQL hittar composition för Fru Andersson', async () => {
    const r = await fetch(`${EHRBASE_URL}/ehrbase/rest/openehr/v1/query/aql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        q: `SELECT c/uid/value FROM EHR e CONTAINS COMPOSITION c WHERE e/ehr_id/value = '${ehrId}'`,
      }),
    });
    expect(r.ok).toBe(true);
    const body = (await r.json()) as { rows?: unknown[][]; meta: { resultsize: number } };
    expect(body.meta.resultsize).toBeGreaterThanOrEqual(1);
    const uids = (body.rows ?? []).map((row) => row[0] as string);
    expect(uids).toContain(compositionUid);
  });
});

describe('openehr-composer — EVALUATION-events post-P3.0b', () => {
  it('medication.prescribed → status=ok via medication_summary.v1 (P3.0b Path A)', async () => {
    const r = await fetch(`${COMPOSER_URL}/composer/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_id: randomUUID(),
        event_type: 'core.clinical.medication.prescribed',
        patient_pnr: PNR,
        source_system: 'e2e-test',
        occurred_at: '2026-04-28T08:00:00Z',
        payload: { drug: 'Warfarin', dose: '5mg' },
      }),
    });
    expect(r.status).toBe(202);
    const body = (await r.json()) as { status: string; composition_uid?: string };
    expect(body.status).toBe('ok');
    expect(body.composition_uid).toMatch(/^[0-9a-f-]{8,}/);
  });

  it('/composer/stats inkluderar constraints_observed med DV_QUANTITY', async () => {
    const r = await fetch(`${COMPOSER_URL}/composer/stats`);
    expect(r.ok).toBe(true);
    const body = (await r.json()) as {
      events_received: number;
      compositions_written: number;
      events_gap: number;
      gaps: Array<{ kind: string; eventType: string }>;
      constraints_observed: Array<{ rm_type_name: string; count: number }>;
    };
    expect(body.events_received).toBeGreaterThanOrEqual(2);
    expect(body.compositions_written).toBeGreaterThanOrEqual(1);
    expect(body.events_gap).toBeGreaterThanOrEqual(1);
    const constraintTypes = new Set(body.constraints_observed.map((c) => c.rm_type_name));
    expect(constraintTypes.has('DV_QUANTITY')).toBe(true);
  });
});

describe('openehr-composer — procedure event (action_minimal shape)', () => {
  it('procedure.completed → composed via minimal_action.en.v1', async () => {
    const r = await fetch(`${COMPOSER_URL}/composer/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_id: randomUUID(),
        event_type: 'core.clinical.procedure.completed',
        patient_pnr: PNR,
        source_system: 'e2e-test',
        occurred_at: '2024-06-15T10:00:00Z',
        payload: { description: 'Höftledsprotes höger (e2e)' },
      }),
    });
    expect(r.status).toBe(201);
    const body = (await r.json()) as { status: string; template_id: string };
    expect(body.status).toBe('composed');
    expect(body.template_id).toBe('minimal_action.en.v1');
  });
});
