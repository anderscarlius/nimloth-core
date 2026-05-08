// Tester för LlmAssist (4.5). Använder ModelRouter med en SequenceProvider
// som returnerar förutbestämda text-svar per anrop, så vi kan testa
// retry-loops, JSON-extraktion, och Zod-validering deterministiskt utan
// faktisk LLM-anslutning.

import { describe, expect, it } from 'vitest';
import pino from 'pino';
import {
  ModelRouter,
  type Provider,
  type ProviderDescriptor,
  type RouterConfig,
} from '@nimloth-core/model-router';
import {
  extractJson,
  invokeAndParse,
  loadPrompts,
  renderUser,
  LlmAssist,
  DosageQuantitySchema,
} from '../llm-assist.js';
import type { MedicationStatement } from '../../validation/fhir.js';

// ============================================================
// Test helpers
// ============================================================

const silentLogger = pino({ level: 'silent' });

class SequenceProvider implements Provider {
  public callCount = 0;
  constructor(
    public readonly descriptor: ProviderDescriptor,
    private readonly responses: string[],
  ) {}
  async invoke(_model: string, _req: unknown): Promise<{
    text: string;
    inputTokens: number;
    outputTokens: number;
  }> {
    const text = this.responses[this.callCount] ?? this.responses[this.responses.length - 1] ?? '';
    this.callCount++;
    return { text, inputTokens: 10, outputTokens: 10 };
  }
  async isHealthy(): Promise<boolean> {
    return true;
  }
}

function createRouter(responses: string[]): ModelRouter {
  const desc: ProviderDescriptor = {
    id: 'seq',
    type: 'mock',
    enabled: true,
    models: ['mock-default'],
    dataResidency: 'on-premise',
    requiresInternet: false,
    config: {},
  };
  const config: RouterConfig = {
    providers: [desc],
    routing: [
      {
        task: 'mapping.medication.compose',
        sensitivity: 'phi',
        require: 'on-premise',
        prefer: [{ providerId: 'seq', model: 'mock-default' }],
        fallback: [],
      },
    ],
  };
  return new ModelRouter(config, {
    providerFactory: (d) => new SequenceProvider(d, responses),
    healthChecks: false,
  });
}

const baseMs = (): MedicationStatement => ({
  resourceType: 'MedicationStatement',
  status: 'active',
  medicationCodeableConcept: {
    coding: [{ system: 'http://www.whocc.no/atc', code: 'B01AA03', display: 'Warfarin' }],
  },
  subject: { reference: 'Patient/19500315-2384' },
  dosage: [{ text: '2.5 mg dagligen' }],
});

// ============================================================
// extractJson-tester
// ============================================================

describe('extractJson', () => {
  it('extraherar plain JSON', () => {
    expect(extractJson('{"value": 1}')).toEqual({ value: 1 });
  });

  it('extraherar JSON med prefix-prosa', () => {
    expect(extractJson('Här är svaret: {"value": 2}')).toEqual({ value: 2 });
  });

  it('extraherar JSON ur markdown-fenced block', () => {
    const text = '```json\n{"value": 3}\n```';
    expect(extractJson(text)).toEqual({ value: 3 });
  });

  it('hanterar fenced block utan json-tag', () => {
    const text = '```\n{"value": 4}\n```';
    expect(extractJson(text)).toEqual({ value: 4 });
  });

  it('extraherar JSON efter <think>-block (deepseek-r1)', () => {
    const text = '<think>låt mig fundera</think>\n```json\n{"value": 5}\n```';
    expect(extractJson(text)).toEqual({ value: 5 });
  });

  it('returnerar null när ingen JSON finns', () => {
    expect(extractJson('bara prosa här')).toBeNull();
  });

  it('returnerar null vid trasig JSON', () => {
    expect(extractJson('{"value": ')).toBeNull();
  });
});

// ============================================================
// renderUser
// ============================================================

describe('renderUser', () => {
  it('substituerar {{KEY}} med värde', () => {
    expect(renderUser('Hej {{NAME}}!', { NAME: 'Anders' })).toBe('Hej Anders!');
  });

  it('substituerar flera variabler', () => {
    expect(renderUser('{{A}}-{{B}}', { A: 'x', B: 'y' })).toBe('x-y');
  });

  it('låter okända {{VAR}} stå kvar oförändrade', () => {
    expect(renderUser('{{KNOWN}}-{{UNKNOWN}}', { KNOWN: 'k' })).toBe('k-{{UNKNOWN}}');
  });
});

// ============================================================
// loadPrompts (mot riktiga prompts/-katalogen)
// ============================================================

describe('loadPrompts', () => {
  it('laddar alla fyra prompt-filer från default prompts/-katalogen', () => {
    const prompts = loadPrompts();
    expect(prompts['parse-dosage-text']).toBeDefined();
    expect(prompts['parse-dosage-timing']).toBeDefined();
    expect(prompts['infer-status']).toBeDefined();
    expect(prompts['suggest-atc']).toBeDefined();
    // System + userTemplate ska vara non-empty
    for (const id of Object.keys(prompts)) {
      expect(prompts[id]?.system.length).toBeGreaterThan(20);
      expect(prompts[id]?.userTemplate.length).toBeGreaterThan(10);
    }
  });
});

// ============================================================
// invokeAndParse retry-logik
// ============================================================

describe('invokeAndParse', () => {
  const validJson = '{"value": 2.5, "unit": "mg", "confidence": 0.9, "reasoning": "ok"}';
  const invalidJson = 'inget JSON här alls';
  const zodInvalid = '{"value": "not-a-number", "unit": "mg", "confidence": 0.9, "reasoning": "x"}';

  it('lyckas på första försöket (attempts: 1)', async () => {
    const router = createRouter([validJson]);
    const result = await invokeAndParse(router, 's', 'u', DosageQuantitySchema, silentLogger);
    expect(result?.attempts).toBe(1);
    expect(result?.data.value).toBe(2.5);
  });

  it('retryar vid extract-fel och lyckas (attempts: 2)', async () => {
    const router = createRouter([invalidJson, validJson]);
    const result = await invokeAndParse(router, 's', 'u', DosageQuantitySchema, silentLogger);
    expect(result?.attempts).toBe(2);
  });

  it('retryar vid Zod-fel och lyckas (attempts: 2)', async () => {
    const router = createRouter([zodInvalid, validJson]);
    const result = await invokeAndParse(router, 's', 'u', DosageQuantitySchema, silentLogger);
    expect(result?.attempts).toBe(2);
  });

  it('returnerar null efter 3 misslyckade attempts', async () => {
    const router = createRouter([invalidJson, invalidJson, invalidJson]);
    const result = await invokeAndParse(router, 's', 'u', DosageQuantitySchema, silentLogger);
    expect(result).toBeNull();
  });

  it('returnerar null när alla tre attempts ger Zod-fel', async () => {
    const router = createRouter([zodInvalid, zodInvalid, zodInvalid]);
    const result = await invokeAndParse(router, 's', 'u', DosageQuantitySchema, silentLogger);
    expect(result).toBeNull();
  });
});

// ============================================================
// LlmAssist-klassen
// ============================================================

describe('LlmAssist', () => {
  const dosageJson = '{"value": 5, "unit": "mg", "confidence": 0.95, "reasoning": "tydlig dos"}';
  const timingJson = '{"code": "TID", "confidence": 0.9, "reasoning": "x 3"}';
  const statusJson = '{"status": null, "confidence": 0, "reasoning": "entered-in-error utan kontext"}';
  const atcJson = '{"code": "B01AA03", "display": "Warfarin", "confidence": 0.95, "reasoning": "klassisk antikoagulant"}';

  it('parseDosageText happy path returnerar LlmField med attempts=1', async () => {
    const router = createRouter([dosageJson]);
    const assist = new LlmAssist({ router, logger: silentLogger });
    const result = await assist.parseDosageText(baseMs());
    expect(result).not.toBeNull();
    expect(result?.attempts).toBe(1);
    expect(result?.value.value).toBe(5);
    expect(result?.value.unit).toBe('mg');
    expect(result?.confidence).toBe(0.95);
    expect(result?.reasoning).toBe('tydlig dos');
  });

  it('parseDosageText returnerar null om dosage[0].text saknas (utan router-anrop)', async () => {
    const router = createRouter([dosageJson]);
    const assist = new LlmAssist({ router, logger: silentLogger });
    const ms: MedicationStatement = { ...baseMs(), dosage: undefined };
    const result = await assist.parseDosageText(ms);
    expect(result).toBeNull();
  });

  it('parseDosageText hanterar markdown-fenced JSON', async () => {
    const fenced = '```json\n' + dosageJson + '\n```';
    const router = createRouter([fenced]);
    const assist = new LlmAssist({ router, logger: silentLogger });
    const result = await assist.parseDosageText(baseMs());
    expect(result?.attempts).toBe(1);
    expect(result?.value.value).toBe(5);
  });

  it('parseDosageText returnerar null efter 3 ogiltiga attempts', async () => {
    const router = createRouter(['junk', 'junk', 'junk']);
    const assist = new LlmAssist({ router, logger: silentLogger });
    const result = await assist.parseDosageText(baseMs());
    expect(result).toBeNull();
  });

  it('parseDosageTiming happy path med TID-kod', async () => {
    const router = createRouter([timingJson]);
    const assist = new LlmAssist({ router, logger: silentLogger });
    const ms: MedicationStatement = {
      ...baseMs(),
      dosage: [{ text: '500 mg tre gånger dagligen' }],
    };
    const result = await assist.parseDosageTiming(ms);
    expect(result?.value.code).toBe('TID');
  });

  it('parseDosageTiming returnerar null när inget timing eller text finns', async () => {
    const router = createRouter([timingJson]);
    const assist = new LlmAssist({ router, logger: silentLogger });
    const ms: MedicationStatement = { ...baseMs(), dosage: [{}] };
    const result = await assist.parseDosageTiming(ms);
    expect(result).toBeNull();
  });

  it('inferStatus happy path med entered-in-error → null-status', async () => {
    const router = createRouter([statusJson]);
    const assist = new LlmAssist({ router, logger: silentLogger });
    const ms: MedicationStatement = { ...baseMs(), status: 'entered-in-error' };
    const result = await assist.inferStatus(ms);
    expect(result).not.toBeNull();
    expect(result?.value.status).toBeNull();
  });

  it('suggestAtc happy path returnerar valid ATC-kod', async () => {
    const router = createRouter([atcJson]);
    const assist = new LlmAssist({ router, logger: silentLogger });
    const result = await assist.suggestAtc(baseMs());
    expect(result?.value.code).toBe('B01AA03');
    expect(result?.value.display).toBe('Warfarin');
  });

  it('suggestAtc returnerar null efter 3 attempts med Zod-invalid ATC-format', async () => {
    const invalidAtc = '{"code": "INVALID", "display": "x", "confidence": 0.5, "reasoning": "y"}';
    const router = createRouter([invalidAtc, invalidAtc, invalidAtc]);
    const assist = new LlmAssist({ router, logger: silentLogger });
    const result = await assist.suggestAtc(baseMs());
    expect(result).toBeNull();
  });

  it('suggestAtc returnerar null när varken display eller text finns', async () => {
    const router = createRouter([atcJson]);
    const assist = new LlmAssist({ router, logger: silentLogger });
    const ms: MedicationStatement = {
      ...baseMs(),
      medicationCodeableConcept: { coding: [{ system: 'x', code: 'y' }] },
    };
    const result = await assist.suggestAtc(ms);
    expect(result).toBeNull();
  });
});
