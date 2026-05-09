import { describe, expect, it } from 'vitest';
import { ModelRouter, residencyAllows } from '../router.js';
import { MockProvider } from '../providers/mock.js';
import {
  RouteUnavailableError,
  type DataResidency,
  type Provider,
  type ProviderDescriptor,
  type RouterAuditEvent,
  type RouterConfig,
  type Sensitivity,
} from '../types.js';

function mockDescriptor(over: Partial<ProviderDescriptor> = {}): ProviderDescriptor {
  return {
    id: 'mock',
    type: 'mock',
    enabled: true,
    models: ['mock-default'],
    dataResidency: 'on-premise',
    requiresInternet: false,
    config: {},
    ...over,
  };
}

class FailingProvider implements Provider {
  constructor(public readonly descriptor: ProviderDescriptor) {}
  async invoke(): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
    throw new Error('boom');
  }
  async isHealthy(): Promise<boolean> {
    return true;
  }
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

describe('ModelRouter', () => {
  it('routar ett schema-only task till mock-providern', async () => {
    const audits: RouterAuditEvent[] = [];
    const config: RouterConfig = {
      providers: [mockDescriptor()],
      routing: [
        {
          task: 'mapping.propose',
          sensitivity: 'schema-only',
          prefer: [{ providerId: 'mock', model: 'mock-default' }],
          fallback: [],
        },
      ],
    };
    const router = new ModelRouter(config, { audit: (e) => audits.push(e) });
    const result = await router.invoke({
      task: 'mapping.propose',
      systemPrompt: 'system',
      userPrompt: 'mapping.propose example',
      sensitivity: 'schema-only',
    });
    expect(result.providerId).toBe('mock');
    expect(result.text).toContain('Mock-genererad mapper-stub');
    expect(result.promptHash).toMatch(/^[0-9a-f]{64}$/);
    expect(audits).toHaveLength(1);
    expect(audits[0].outcome).toBe('success');
  });

  it('avvisar PHI-routing till cloud-provider', async () => {
    const config: RouterConfig = {
      providers: [
        mockDescriptor({ id: 'cloud', dataResidency: 'us-cloud', requiresInternet: true }),
        mockDescriptor({ id: 'local', dataResidency: 'on-premise' }),
      ],
      routing: [
        {
          task: 'mapping.ask',
          sensitivity: 'phi',
          require: 'on-premise',
          // Cloud listad först — routern måste hoppa över den.
          prefer: [
            { providerId: 'cloud', model: 'mock-default' },
            { providerId: 'local', model: 'mock-default' },
          ],
          fallback: [],
        },
      ],
    };
    const router = new ModelRouter(config);
    const result = await router.invoke({
      task: 'mapping.ask',
      systemPrompt: 'system',
      userPrompt: 'mapping.ask',
      sensitivity: 'phi',
    });
    expect(result.providerId).toBe('local');
  });

  it('faller över till nästa provider när första kastar', async () => {
    const audits: RouterAuditEvent[] = [];
    const config: RouterConfig = {
      providers: [
        mockDescriptor({ id: 'broken', type: 'mock' }),
        mockDescriptor({ id: 'good', type: 'mock' }),
      ],
      routing: [
        {
          task: 'mapping.propose',
          sensitivity: 'schema-only',
          prefer: [{ providerId: 'broken', model: 'mock-default' }],
          fallback: [{ providerId: 'good', model: 'mock-default' }],
        },
      ],
    };
    const router = new ModelRouter(config, {
      audit: (e) => audits.push(e),
      providerFactory: (d) =>
        d.id === 'broken' ? new FailingProvider(d) : new MockProvider(d),
    });
    const result = await router.invoke({
      task: 'mapping.propose',
      systemPrompt: 'system',
      userPrompt: 'mapping.propose',
      sensitivity: 'schema-only',
    });
    expect(result.providerId).toBe('good');
    expect(audits.find((a) => a.outcome === 'error')).toBeDefined();
    expect(audits.find((a) => a.outcome === 'success')).toBeDefined();
  });

  it('hoppar över unhealthy providers när health-checks är aktiverade', async () => {
    const config: RouterConfig = {
      providers: [
        mockDescriptor({ id: 'down' }),
        mockDescriptor({ id: 'up' }),
      ],
      routing: [
        {
          task: 'mapping.propose',
          sensitivity: 'schema-only',
          prefer: [{ providerId: 'down', model: 'mock-default' }],
          fallback: [{ providerId: 'up', model: 'mock-default' }],
        },
      ],
    };
    const router = new ModelRouter(config, {
      providerFactory: (d) => (d.id === 'down' ? new UnhealthyProvider(d) : new MockProvider(d)),
    });
    const result = await router.invoke({
      task: 'mapping.propose',
      systemPrompt: 's',
      userPrompt: 'mapping.propose',
      sensitivity: 'schema-only',
    });
    expect(result.providerId).toBe('up');
  });

  it('kastar RouteUnavailableError när inga providers matchar', async () => {
    const config: RouterConfig = {
      providers: [
        mockDescriptor({ id: 'cloud', dataResidency: 'us-cloud', requiresInternet: true }),
      ],
      routing: [
        {
          task: 'mapping.ask',
          sensitivity: 'phi',
          require: 'on-premise',
          prefer: [{ providerId: 'cloud', model: 'mock-default' }],
          fallback: [],
        },
      ],
    };
    const router = new ModelRouter(config);
    await expect(
      router.invoke({
        task: 'mapping.ask',
        systemPrompt: 's',
        userPrompt: 'u',
        sensitivity: 'phi',
      }),
    ).rejects.toBeInstanceOf(RouteUnavailableError);
  });

  it('synthetic-sensitivity routar till us-cloud när det är preferens (B22.5)', async () => {
    // Syntetisk data (eval-paren, demo-fixtures) får routas till cloud.
    // Speglar produktions-pattern där composition-mapper sätter sensitivity
    // baserat på NIMLOTH_DATA_MODE-env.
    const config: RouterConfig = {
      providers: [
        mockDescriptor({ id: 'anthropic-cloud', dataResidency: 'us-cloud', requiresInternet: true }),
        mockDescriptor({ id: 'local', dataResidency: 'on-premise' }),
      ],
      routing: [
        {
          task: 'mapping.medication.compose',
          sensitivity: 'synthetic',
          prefer: [
            { providerId: 'anthropic-cloud', model: 'mock-default' },
            { providerId: 'local', model: 'mock-default' },
          ],
          fallback: [],
        },
      ],
    };
    const router = new ModelRouter(config);
    const result = await router.invoke({
      task: 'mapping.medication.compose',
      systemPrompt: 's',
      userPrompt: 'u',
      sensitivity: 'synthetic',
    });
    expect(result.providerId).toBe('anthropic-cloud');
  });

  it('väljer rätt regel när samma task har både phi- och synthetic-regler (B22.5)', async () => {
    // Production-config har `mapping.medication.compose` med phi-routing till
    // on-premise OCH synthetic-routing till cloud. Routern måste välja
    // regeln vars sensitivity matchar req.sensitivity — inte bara den första.
    const config: RouterConfig = {
      providers: [
        mockDescriptor({ id: 'cloud', dataResidency: 'us-cloud', requiresInternet: true }),
        mockDescriptor({ id: 'local', dataResidency: 'on-premise' }),
      ],
      routing: [
        {
          task: 'mapping.medication.compose',
          sensitivity: 'phi',
          require: 'on-premise',
          prefer: [{ providerId: 'local', model: 'mock-default' }],
          fallback: [],
        },
        {
          task: 'mapping.medication.compose',
          sensitivity: 'synthetic',
          prefer: [{ providerId: 'cloud', model: 'mock-default' }],
          fallback: [],
        },
      ],
    };
    const router = new ModelRouter(config);
    const phiResult = await router.invoke({
      task: 'mapping.medication.compose',
      systemPrompt: 's',
      userPrompt: 'u',
      sensitivity: 'phi',
    });
    expect(phiResult.providerId).toBe('local');
    const syntheticResult = await router.invoke({
      task: 'mapping.medication.compose',
      systemPrompt: 's',
      userPrompt: 'u',
      sensitivity: 'synthetic',
    });
    expect(syntheticResult.providerId).toBe('cloud');
  });

  it('phi-hard-rule är oförändrat trots att synthetic-tier finns (regression-skydd, B22.5)', async () => {
    // Verifierar att tillägget av synthetic INTE har luckrat upp phi-låsningen.
    // Cloud listad först — routern måste hoppa över den även med synthetic-
    // tier i samma config.
    const config: RouterConfig = {
      providers: [
        mockDescriptor({ id: 'cloud', dataResidency: 'us-cloud', requiresInternet: true }),
        mockDescriptor({ id: 'local', dataResidency: 'on-premise' }),
      ],
      routing: [
        {
          task: 'mapping.medication.compose',
          sensitivity: 'phi',
          require: 'on-premise',
          prefer: [
            { providerId: 'cloud', model: 'mock-default' },
            { providerId: 'local', model: 'mock-default' },
          ],
          fallback: [],
        },
      ],
    };
    const router = new ModelRouter(config);
    const result = await router.invoke({
      task: 'mapping.medication.compose',
      systemPrompt: 's',
      userPrompt: 'u',
      sensitivity: 'phi',
    });
    expect(result.providerId).toBe('local');
  });

  describe('residencyAllows-matrix (B22.5)', () => {
    const cases: Array<[Sensitivity, DataResidency, boolean]> = [
      ['phi', 'on-premise', true],
      ['phi', 'eu-cloud', false],
      ['phi', 'us-cloud', false],
      ['pii', 'on-premise', true],
      ['pii', 'eu-cloud', true],
      ['pii', 'us-cloud', false],
      ['synthetic', 'on-premise', true],
      ['synthetic', 'eu-cloud', true],
      ['synthetic', 'us-cloud', true],
      ['schema-only', 'on-premise', true],
      ['schema-only', 'us-cloud', true],
      ['public', 'us-cloud', true],
    ];
    it.each(cases)('residencyAllows(%s, %s) === %s', (sens, res, expected) => {
      expect(residencyAllows(sens, res)).toBe(expected);
    });
  });

  it('promptHash är deterministisk', async () => {
    const router = new ModelRouter(
      {
        providers: [mockDescriptor()],
        routing: [
          {
            task: 't',
            sensitivity: 'schema-only',
            prefer: [{ providerId: 'mock', model: 'mock-default' }],
            fallback: [],
          },
        ],
      },
      { healthChecks: false },
    );
    const a = await router.invoke({ task: 't', systemPrompt: 'sys', userPrompt: 'u', sensitivity: 'schema-only' });
    const b = await router.invoke({ task: 't', systemPrompt: 'sys', userPrompt: 'u', sensitivity: 'schema-only' });
    expect(a.promptHash).toBe(b.promptHash);
    const c = await router.invoke({ task: 't', systemPrompt: 'sys', userPrompt: 'other', sensitivity: 'schema-only' });
    expect(c.promptHash).not.toBe(a.promptHash);
  });
});
