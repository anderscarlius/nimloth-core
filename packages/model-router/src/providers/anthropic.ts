// Anthropic-provider via @anthropic-ai/sdk. Använder Messages API och
// returnerar "raw"-text — strukturerad parsing (TS-mapper-extraction etc.)
// är konsumentens ansvar.
//
// API-key läses från env-variabel angiven i descriptor.config.apiKeyEnv
// (default: ANTHROPIC_API_KEY). Saknas key → isHealthy() returnerar false
// och routern hoppar över providern.

import Anthropic from '@anthropic-ai/sdk';
import type { InvokeRequest, Provider, ProviderDescriptor } from '../types.js';

interface AnthropicConfig {
  apiKeyEnv?: string;
  baseURL?: string;
}

export class AnthropicProvider implements Provider {
  private readonly client: Anthropic | null;
  private readonly apiKeyEnv: string;

  constructor(public readonly descriptor: ProviderDescriptor) {
    const cfg = (descriptor.config ?? {}) as AnthropicConfig;
    this.apiKeyEnv = cfg.apiKeyEnv ?? 'ANTHROPIC_API_KEY';
    const key = process.env[this.apiKeyEnv];
    this.client = key
      ? new Anthropic({ apiKey: key, baseURL: cfg.baseURL })
      : null;
  }

  async invoke(
    model: string,
    req: InvokeRequest,
  ): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
    if (!this.client) {
      throw new Error(
        `AnthropicProvider "${this.descriptor.id}" has no API key (env=${this.apiKeyEnv}). Set the env var or disable provider in routing config.`,
      );
    }
    const result = await this.client.messages.create({
      model,
      max_tokens: req.maxTokens ?? 4096,
      temperature: req.temperature ?? 0,
      system: req.systemPrompt,
      messages: [{ role: 'user', content: req.userPrompt }],
    });
    const text = result.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('');
    return {
      text,
      inputTokens: result.usage.input_tokens,
      outputTokens: result.usage.output_tokens,
    };
  }

  async isHealthy(): Promise<boolean> {
    return this.client !== null;
  }
}
