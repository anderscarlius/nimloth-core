// Ollama-provider — open-weights-modeller på egen hårdvara via Ollama HTTP API.
// Krävs när routing-regler har require: 'on-premise' (t.ex. för PHI-tasks).
//
// I Sprint 2 är detta en funktionell stub: vi pratar Ollama-protokollet men
// förutsätter att operatören startar Ollama själv. Default-endpoint matchar
// Ollamas standardport (11434). Healthcheck via GET /api/tags.

import type { InvokeRequest, Provider, ProviderDescriptor } from '../types.js';

interface OllamaConfig {
  endpoint?: string;
  timeoutMs?: number;
}

export class OllamaProvider implements Provider {
  private readonly endpoint: string;
  private readonly timeoutMs: number;

  constructor(public readonly descriptor: ProviderDescriptor) {
    const cfg = (descriptor.config ?? {}) as OllamaConfig;
    this.endpoint = (cfg.endpoint ?? 'http://localhost:11434').replace(/\/$/, '');
    this.timeoutMs = cfg.timeoutMs ?? 60_000;
  }

  async invoke(
    model: string,
    req: InvokeRequest,
  ): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.endpoint}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: ctrl.signal,
        body: JSON.stringify({
          model,
          stream: false,
          options: {
            temperature: req.temperature ?? 0,
            num_predict: req.maxTokens ?? 4096,
          },
          messages: [
            { role: 'system', content: req.systemPrompt },
            { role: 'user', content: req.userPrompt },
          ],
        }),
      });
      if (!res.ok) {
        throw new Error(`Ollama HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        message?: { content?: string };
        prompt_eval_count?: number;
        eval_count?: number;
      };
      return {
        text: data.message?.content ?? '',
        inputTokens: data.prompt_eval_count ?? 0,
        outputTokens: data.eval_count ?? 0,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 2_000);
      const res = await fetch(`${this.endpoint}/api/tags`, { signal: ctrl.signal });
      clearTimeout(timer);
      return res.ok;
    } catch {
      return false;
    }
  }
}
