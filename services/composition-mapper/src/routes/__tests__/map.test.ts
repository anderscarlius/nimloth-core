// Integration-tester för POST /api/v1/map/medication-statement (B25 4.10.5).
// Använder en kö-baserad mock-provider (deterministisk) så vi slipper riktiga
// Anthropic-anrop. Modellen är: queue:a förväntade LLM-svar innan request, så
// matas de ut i ordning till varje invoke().

import { describe, it, expect, beforeEach } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import pino from 'pino';
import { ModelRouter } from '@nimloth-core/model-router';
import type {
  InvokeRequest,
  Provider,
  ProviderDescriptor,
  RouterConfig,
} from '@nimloth-core/model-router';
import { createMapRouter } from '../map.js';
import type { CompositionMapperConfig } from '../../config.js';
import type { MedicationStatement } from '../../validation/fhir.js';

const silentLogger = pino({ level: 'silent' });

// ============================================================
// SequenceProvider — kö av JSON-svar för LLM-anrop. Återanvänds över tester.
// ============================================================

class SequenceProvider implements Provider {
  private queue: string[] = [];

  constructor(public readonly descriptor: ProviderDescriptor) {}

  enqueue(...responses: string[]): void {
    this.queue.push(...responses);
  }

  async invoke(
    _model: string,
    _req: InvokeRequest,
  ): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
    const text = this.queue.shift();
    if (text === undefined) {
      throw new Error('SequenceProvider queue empty — fler LLM-anrop än förväntat');
    }
    return { text, inputTokens: 100, outputTokens: 50 };
  }

  async isHealthy(): Promise<boolean> {
    return true;
  }
}

// ============================================================
// Test-fixtures
// ============================================================

function makeRouterConfig(providerId = 'test-mock'): RouterConfig {
  return {
    providers: [
      {
        id: providerId,
        type: 'mock',
        enabled: true,
        models: ['test-model'],
        dataResidency: 'us-cloud',
        requiresInternet: true,
        config: {},
      },
    ],
    routing: [
      {
        task: 'mapping.medication.compose',
        sensitivity: 'synthetic',
        prefer: [{ providerId, model: 'test-model' }],
        fallback: [],
      },
    ],
  };
}

function makeConfig(): CompositionMapperConfig {
  return {
    port: 0,
    logLevel: 'silent',
    dbPath: '/tmp/test.db',
    migrationsPath: '/tmp/migrations',
    dataMode: 'synthetic',
    kafka: {
      brokers: ['disabled'],
      clientId: 'test',
      auditTopic: 'test',
      drainIntervalMs: 60_000,
    },
  };
}

const validMedicationStatement: MedicationStatement = {
  resourceType: 'MedicationStatement',
  status: 'active',
  medicationCodeableConcept: {
    coding: [
      {
        system: 'http://www.whocc.no/atc',
        code: 'B01AA03',
        display: 'Waran',
      },
    ],
  },
  subject: { reference: 'Patient/test-001' },
  effectiveDateTime: '2026-05-01T08:00:00Z',
  dosage: [
    {
      text: '2.5 mg dagligen',
      timing: { code: { text: 'dagligen' } },
    },
  ],
};

function buildApp(): { app: Express; provider: SequenceProvider } {
  let captured: SequenceProvider | null = null;
  const cfg = makeRouterConfig();
  const router = new ModelRouter(cfg, {
    providerFactory: (d) => {
      const p = new SequenceProvider(d);
      captured = p;
      return p;
    },
  });
  const app = express();
  app.use(express.json());
  app.use(
    '/api/v1/map',
    createMapRouter({
      router,
      config: makeConfig(),
      logger: silentLogger,
    }),
  );
  if (!captured) throw new Error('Provider not captured');
  return { app, provider: captured };
}

// ============================================================
// Tester
// ============================================================

describe('POST /api/v1/map/medication-statement', () => {
  let app: Express;
  let provider: SequenceProvider;

  beforeEach(() => {
    ({ app, provider } = buildApp());
  });

  it('happy path — returnerar AggregationResult med deterministic + LLM fält', async () => {
    // mapMedicationStatement anropar i ordning:
    //   1. parseDosageText  (om dosage.text finns)
    //   2. parseDosageTiming (om timing finns)
    //   inferStatus  (bara om deterministic status null — INTE här, status="active")
    //   suggestAtc   (bara om code saknas/UNKNOWN — INTE här, B01AA03 finns)
    provider.enqueue(
      JSON.stringify({ value: 2.5, unit: 'mg', confidence: 0.95, reasoning: 'tydligt' }),
      JSON.stringify({ code: 'DAILY', confidence: 0.9, reasoning: 'dagligen' }),
    );

    const response = await request(app)
      .post('/api/v1/map/medication-statement')
      .send({ resource: validMedicationStatement });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('complete');
    expect(response.body.composition).toBeDefined();
    expect(response.body.composition.medicationName?.value.code).toBe('B01AA03');
    expect(response.body.composition.doseQuantity?.value.value).toBe(2.5);
    expect(response.body.composition.frequency?.value).toBe('DAILY');
    expect(response.body.aggregateConfidence).toBeGreaterThan(0.8);
  });

  it('validation-fel returnerar 400 vid invalid FHIR-resurs', async () => {
    const response = await request(app)
      .post('/api/v1/map/medication-statement')
      .send({ resource: { invalid: 'not-a-medication-statement' } });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('validation_error');
    expect(response.body.details).toBeDefined();
  });

  it('saknat resource-fält returnerar 400', async () => {
    const response = await request(app)
      .post('/api/v1/map/medication-statement')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('validation_error');
  });

  it('inputId genereras automatiskt om saknas', async () => {
    provider.enqueue(
      JSON.stringify({ value: 5, unit: 'mg', confidence: 0.9, reasoning: '' }),
      JSON.stringify({ code: 'DAILY', confidence: 0.9, reasoning: '' }),
    );

    const response = await request(app)
      .post('/api/v1/map/medication-statement')
      .send({ resource: validMedicationStatement });

    expect(response.status).toBe(200);
    // reviewPayload finns bara vid human-review; vid complete syns inget id
    // — vi verifierar bara att svaret kommer fram utan inputId i request.
    expect(response.body.status).toBe('complete');
  });

  it('explicit inputId tas emot och propageras (synligt om review triggas)', async () => {
    // Tvinga low_confidence-trigger via LLM-svar med låg confidence
    provider.enqueue(
      JSON.stringify({ value: null, unit: null, confidence: 0, reasoning: 'tvetydig' }),
      JSON.stringify({ code: null, confidence: 0, reasoning: 'tvetydig' }),
    );

    const response = await request(app)
      .post('/api/v1/map/medication-statement')
      .send({ resource: validMedicationStatement, inputId: 'custom-id-42' });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('human-review-required');
    expect(response.body.reviewPayload?.inputId).toBe('custom-id-42');
  });

  it('options.useLlm=false skip:ar LLM och gör bara deterministic mapping', async () => {
    // Inga LLM-svar i kön — borde inte behövas
    const response = await request(app)
      .post('/api/v1/map/medication-statement')
      .send({
        resource: validMedicationStatement,
        options: { useLlm: false },
      });

    expect(response.status).toBe(200);
    // doseQuantity är LLM-only — utan LLM blir den unknown
    expect(response.body.composition.doseQuantity).toBeUndefined();
    // medicationName är deterministic — finns
    expect(response.body.composition.medicationName?.value.code).toBe('B01AA03');
  });

  it('sensitivity propageras till model-router som synthetic (B22.5)', async () => {
    let capturedSensitivity: string | undefined;
    const cfg = makeRouterConfig();
    const router = new ModelRouter(cfg, {
      providerFactory: (d) => {
        const seq = new SequenceProvider(d);
        const orig = seq.invoke.bind(seq);
        seq.invoke = async (model, req) => {
          capturedSensitivity = req.sensitivity;
          return orig(model, req);
        };
        seq.enqueue(
          JSON.stringify({ value: 5, unit: 'mg', confidence: 0.9, reasoning: '' }),
          JSON.stringify({ code: 'DAILY', confidence: 0.9, reasoning: '' }),
        );
        return seq;
      },
    });
    const localApp = express();
    localApp.use(express.json());
    localApp.use(
      '/api/v1/map',
      createMapRouter({ router, config: makeConfig(), logger: silentLogger }),
    );

    await request(localApp)
      .post('/api/v1/map/medication-statement')
      .send({ resource: validMedicationStatement })
      .expect(200);

    expect(capturedSensitivity).toBe('synthetic');
  });
});
