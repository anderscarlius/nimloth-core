// Tester för P4 4.5-tasken `mapping.medication.compose`.
// Verifierar happy-path-routing (Hemmabasen primary), boot-time-validering
// (PHI hard rule), och fallback-kedja (Hemmabasen unhealthy → mock).
//
// Använder inline RouterConfig i samma stil som router.test.ts — håller
// testerna isolerade från config/model-routing.yaml-state.

import { describe, expect, it } from 'vitest';
import { ModelRouter } from '../router.js';
import { MockProvider } from '../providers/mock.js';
import { validateConfig } from '../config.js';
import type { Provider, ProviderDescriptor, RouterConfig } from '../types.js';

const HEMMABASEN_ID = 'hemmabasen-ollama';
const MOCK_ID = 'mock';
const MEDICATION_TASK = 'mapping.medication.compose';

function hemmabasenDescriptor(over: Partial<ProviderDescriptor> = {}): ProviderDescriptor {
  return {
    id: HEMMABASEN_ID,
    type: 'ollama',
    enabled: true,
    models: ['qwen2.5-coder:32b'],
    dataResidency: 'on-premise',
    requiresInternet: false,
    config: { endpoint: 'http://192.168.1.200:11434' },
    ...over,
  };
}

function mockDescriptor(over: Partial<ProviderDescriptor> = {}): ProviderDescriptor {
  return {
    id: MOCK_ID,
    type: 'mock',
    enabled: true,
    models: ['mock-default'],
    dataResidency: 'on-premise',
    requiresInternet: false,
    config: {},
    ...over,
  };
}

class UnhealthyProvider implements Provider {
  constructor(public readonly descriptor: ProviderDescriptor) {}
  async invoke(): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
    return { text: 'should not be reached', inputTokens: 0, outputTokens: 0 };
  }
  async isHealthy(): Promise<boolean> {
    return false;
  }
}

const taskDefinition = {
  task: MEDICATION_TASK,
  sensitivity: 'phi' as const,
  require: 'on-premise' as const,
  prefer: [{ providerId: HEMMABASEN_ID, model: 'qwen2.5-coder:32b' }],
  fallback: [{ providerId: MOCK_ID, model: 'mock-default' }],
};

describe('mapping.medication.compose (P4 4.5)', () => {
  it('routar till hemmabasen-ollama som primary (happy path)', async () => {
    const config: RouterConfig = {
      providers: [hemmabasenDescriptor(), mockDescriptor()],
      routing: [taskDefinition],
    };
    // Hemmabasen är ollama-provider som kräver fungerande HTTP — använd
    // MockProvider som stand-in via providerFactory så vi inte behöver
    // riktig nätverksanslutning. Testet verifierar att routern VÄLJER
    // hemmabasen-ollama, inte att Ollama-protokollet fungerar.
    const router = new ModelRouter(config, {
      providerFactory: (d) => new MockProvider({ ...d, type: 'mock' }),
      healthChecks: false,
    });
    const result = await router.invoke({
      task: MEDICATION_TASK,
      systemPrompt: 's',
      userPrompt: 'u',
      sensitivity: 'phi',
    });
    expect(result.providerId).toBe(HEMMABASEN_ID);
    expect(result.modelUsed).toBe('qwen2.5-coder:32b');
    expect(result.dataResidency).toBe('on-premise');
  });

  it('boot-time-validering accepterar tasken med PHI + require:on-premise', () => {
    const cfg = validateConfig({
      providers: [hemmabasenDescriptor(), mockDescriptor()],
      routing: [taskDefinition],
    });
    const rule = cfg.routing.find((r) => r.task === MEDICATION_TASK);
    expect(rule).toBeDefined();
    expect(rule?.sensitivity).toBe('phi');
    expect(rule?.require).toBe('on-premise');
    // Provider-referens från prefer ska vara intakt
    expect(rule?.prefer[0]?.providerId).toBe(HEMMABASEN_ID);
  });

  it('faller över till mock när hemmabasen-ollama är unhealthy', async () => {
    const config: RouterConfig = {
      providers: [hemmabasenDescriptor(), mockDescriptor()],
      routing: [taskDefinition],
    };
    const router = new ModelRouter(config, {
      providerFactory: (d) =>
        d.id === HEMMABASEN_ID
          ? new UnhealthyProvider(d)
          : new MockProvider(d),
      // health-check enabled (default) — UnhealthyProvider returnerar false
    });
    const result = await router.invoke({
      task: MEDICATION_TASK,
      systemPrompt: 's',
      userPrompt: 'u',
      sensitivity: 'phi',
    });
    expect(result.providerId).toBe(MOCK_ID);
    expect(result.dataResidency).toBe('on-premise');
  });
});
