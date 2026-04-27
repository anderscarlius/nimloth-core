import { describe, expect, it } from 'vitest';
import { validateConfig } from '../config.js';

describe('validateConfig', () => {
  const baseProvider = {
    id: 'mock',
    type: 'mock',
    enabled: true,
    models: ['mock-default'],
    dataResidency: 'on-premise',
    requiresInternet: false,
    config: {},
  };

  it('accepterar minimal giltig config', () => {
    const cfg = validateConfig({
      providers: [baseProvider],
      routing: [
        {
          task: 'mapping.propose',
          sensitivity: 'schema-only',
          prefer: [{ providerId: 'mock', model: 'mock-default' }],
          fallback: [],
        },
      ],
    });
    expect(cfg.providers).toHaveLength(1);
    expect(cfg.routing[0].task).toBe('mapping.propose');
  });

  it('avvisar phi-task utan require: on-premise', () => {
    expect(() =>
      validateConfig({
        providers: [baseProvider],
        routing: [
          {
            task: 'mapping.ask',
            sensitivity: 'phi',
            prefer: [{ providerId: 'mock', model: 'mock-default' }],
            fallback: [],
          },
        ],
      }),
    ).toThrow(/MUST set require: on-premise/);
  });

  it('accepterar phi-task med require: on-premise', () => {
    const cfg = validateConfig({
      providers: [baseProvider],
      routing: [
        {
          task: 'mapping.ask',
          sensitivity: 'phi',
          require: 'on-premise',
          prefer: [{ providerId: 'mock', model: 'mock-default' }],
          fallback: [],
        },
      ],
    });
    expect(cfg.routing[0].require).toBe('on-premise');
  });

  it('avvisar referens till okänd provider', () => {
    expect(() =>
      validateConfig({
        providers: [baseProvider],
        routing: [
          {
            task: 'mapping.propose',
            sensitivity: 'schema-only',
            prefer: [{ providerId: 'ghost', model: 'mock-default' }],
            fallback: [],
          },
        ],
      }),
    ).toThrow(/not defined in providers/);
  });

  it('avvisar referens till modell som inte är deklarerad av providern', () => {
    expect(() =>
      validateConfig({
        providers: [baseProvider],
        routing: [
          {
            task: 'mapping.propose',
            sensitivity: 'schema-only',
            prefer: [{ providerId: 'mock', model: 'gpt-99' }],
            fallback: [],
          },
        ],
      }),
    ).toThrow(/not declared by provider/);
  });

  it('avvisar ogiltig sensitivity', () => {
    expect(() =>
      validateConfig({
        providers: [baseProvider],
        routing: [
          {
            task: 'mapping.propose',
            sensitivity: 'top-secret',
            prefer: [],
            fallback: [],
          },
        ],
      }),
    ).toThrow(/sensitivity must be/);
  });
});
