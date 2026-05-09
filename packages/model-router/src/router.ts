// ModelRouter — kärnan som väljer provider+model för en given task,
// kör anropet, beräknar promptHash och returnerar en strukturerad respons
// + ett audit-event som tjänster kan publicera vidare till core.audit.*-topics.
//
// Routing-algoritm (per anrop):
//   1. Slå upp routing-regel på task-namn. Saknas → fel.
//   2. Validera att req.sensitivity matchar regelns sensitivity (skydd mot
//      att uppströmskod råkar skicka phi-data märkt som schema-only).
//   3. Iterera prefer → fallback. För varje (providerId, model):
//      a. Hoppa över providers som är disabled.
//      b. Hoppa över providers vars dataResidency bryter sensitivity-policy
//         eller require-kravet.
//      c. Kör isHealthy(). Hoppa över om false.
//      d. Anropa provider.invoke(). Returnera resultatet.
//   4. Inget alternativ funkade → kasta RouteUnavailableError + audit-event.
//
// Sensitivity-policy (hard rule):
//   - phi  → endast on-premise.
//   - pii  → endast on-premise eller eu-cloud.
//   - schema-only / public → vad som helst.

import { createHash } from 'node:crypto';
import { AnthropicProvider } from './providers/anthropic.js';
import { MockProvider } from './providers/mock.js';
import { OllamaProvider } from './providers/ollama.js';
import {
  RouteUnavailableError,
  SensitivityViolationError,
  type DataResidency,
  type InvokeRequest,
  type InvokeResponse,
  type Provider,
  type ProviderDescriptor,
  type ProviderModelRef,
  type RouterAuditEvent,
  type RouterConfig,
  type RoutingRule,
  type Sensitivity,
} from './types.js';

export type AuditSink = (event: RouterAuditEvent) => void;

export interface RouterDeps {
  /** Override providers — primärt för tester. Default: instansiera från config. */
  providerFactory?: (descriptor: ProviderDescriptor) => Provider;
  /** Audit-mottagare. Anropas synkront efter varje försök, inkl. fel. */
  audit?: AuditSink;
  /** Aktivera health-check innan invoke. Default true. Stäng av i tester med predikabel mock. */
  healthChecks?: boolean;
}

export class ModelRouter {
  private readonly providers: Map<string, Provider>;
  /**
   * Routing-regler grupperas på task-namn. En task får ha flera regler
   * (en per sensitivity-tier) — så samma logiska anrop, t.ex.
   * `mapping.medication.compose`, kan ha `phi`-regel som hård-låser
   * on-premise OCH `synthetic`-regel som tillåter cloud-routing för
   * eval/demo (B22.5).
   */
  private readonly rulesByTask: Map<string, RoutingRule[]>;
  private readonly audit?: AuditSink;
  private readonly doHealthChecks: boolean;

  constructor(config: RouterConfig, deps: RouterDeps = {}) {
    const factory = deps.providerFactory ?? defaultProviderFactory;
    this.providers = new Map(config.providers.map((p) => [p.id, factory(p)]));
    const byTask = new Map<string, RoutingRule[]>();
    for (const rule of config.routing) {
      const list = byTask.get(rule.task) ?? [];
      list.push(rule);
      byTask.set(rule.task, list);
    }
    this.rulesByTask = byTask;
    this.audit = deps.audit;
    this.doHealthChecks = deps.healthChecks ?? true;
  }

  /** Lista konfigurerade providers (för status-endpoints). */
  listProviders(): ProviderDescriptor[] {
    return Array.from(this.providers.values()).map((p) => p.descriptor);
  }

  /** Lista routing-regler (för status-endpoints). */
  listRules(): RoutingRule[] {
    return Array.from(this.rulesByTask.values()).flat();
  }

  async invoke(req: InvokeRequest): Promise<InvokeResponse> {
    const rulesForTask = this.rulesByTask.get(req.task);
    if (!rulesForTask || rulesForTask.length === 0) {
      throw new RouteUnavailableError(req.task, `no routing rule defined for task`, []);
    }
    const rule = rulesForTask.find((r) => r.sensitivity === req.sensitivity);
    if (!rule) {
      // Task finns men inte med begärd sensitivity. Vanliga orsaker:
      // (1) caller läcker fel sensitivity, (2) demo-config saknar synthetic-
      // regel för en task som anropas i synthetic-mode.
      throw new SensitivityViolationError(
        req.task,
        req.sensitivity,
        '<routing-mismatch>',
        'on-premise',
      );
    }

    const promptHash = hashPrompt(req.systemPrompt, req.userPrompt);
    const candidates = [...rule.prefer, ...rule.fallback];
    const attempted: ProviderModelRef[] = [];
    let lastError: Error | null = null;

    for (const ref of candidates) {
      const provider = this.providers.get(ref.providerId);
      if (!provider) continue;
      attempted.push(ref);

      const desc = provider.descriptor;
      if (!desc.enabled) continue;

      // Sensitivity hard rule
      if (!residencyAllows(req.sensitivity, desc.dataResidency)) {
        // Detta hade fångats av config-validering för phi (require: on-premise),
        // men för pii kan en cloud-provider vara med i fallback. Hoppa då.
        continue;
      }
      if (rule.require && desc.dataResidency !== rule.require) continue;

      // Health
      if (this.doHealthChecks) {
        const healthy = await provider.isHealthy().catch(() => false);
        if (!healthy) continue;
      }

      const startedAt = new Date();
      const t0 = performance.now();
      try {
        const out = await provider.invoke(ref.model, req);
        const completedAt = new Date();
        const latencyMs = Math.round(performance.now() - t0);
        const response: InvokeResponse = {
          text: out.text,
          modelUsed: ref.model,
          providerId: desc.id,
          providerType: desc.type,
          dataResidency: desc.dataResidency,
          inputTokens: out.inputTokens,
          outputTokens: out.outputTokens,
          latencyMs,
          promptHash,
          startedAt: startedAt.toISOString(),
          completedAt: completedAt.toISOString(),
        };
        this.emit({
          task: req.task,
          providerId: desc.id,
          providerType: desc.type,
          modelUsed: ref.model,
          dataResidency: desc.dataResidency,
          sensitivity: req.sensitivity,
          promptHash,
          inputTokens: out.inputTokens,
          outputTokens: out.outputTokens,
          latencyMs,
          startedAt: startedAt.toISOString(),
          completedAt: completedAt.toISOString(),
          outcome: 'success',
        });
        return response;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        const completedAt = new Date();
        this.emit({
          task: req.task,
          providerId: desc.id,
          providerType: desc.type,
          modelUsed: ref.model,
          dataResidency: desc.dataResidency,
          sensitivity: req.sensitivity,
          promptHash,
          inputTokens: 0,
          outputTokens: 0,
          latencyMs: Math.round(performance.now() - t0),
          startedAt: startedAt.toISOString(),
          completedAt: completedAt.toISOString(),
          outcome: 'error',
          errorMessage: lastError.message,
        });
        // Försök nästa kandidat
      }
    }

    const reason = lastError
      ? `all providers failed (last error: ${lastError.message})`
      : `no provider satisfied sensitivity/residency/health requirements`;
    this.emit({
      task: req.task,
      providerId: 'none',
      providerType: 'mock',
      modelUsed: 'none',
      dataResidency: 'on-premise',
      sensitivity: req.sensitivity,
      promptHash,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: 0,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      outcome: 'route-unavailable',
      errorMessage: reason,
    });
    throw new RouteUnavailableError(req.task, reason, attempted);
  }

  private emit(event: RouterAuditEvent): void {
    if (!this.audit) return;
    try {
      this.audit(event);
    } catch {
      // Audit-fel får aldrig krascha invoke
    }
  }
}

export function residencyAllows(sensitivity: Sensitivity, residency: DataResidency): boolean {
  switch (sensitivity) {
    case 'phi':
      return residency === 'on-premise';
    case 'pii':
      return residency === 'on-premise' || residency === 'eu-cloud';
    case 'synthetic':
      // Syntetisk data tillåter alla residency-typer eftersom ingen riktig
      // patient-data exponeras. Explicit lista istället för `return true`
      // så framtida residency-typer (gov-cloud, etc.) tvingar medvetet beslut.
      return residency === 'on-premise' || residency === 'eu-cloud' || residency === 'us-cloud';
    case 'schema-only':
    case 'public':
      return true;
  }
}

export function hashPrompt(system: string, user: string): string {
  return createHash('sha256').update(`${system}\n---\n${user}`).digest('hex');
}

function defaultProviderFactory(d: ProviderDescriptor): Provider {
  switch (d.type) {
    case 'anthropic':
      return new AnthropicProvider(d);
    case 'ollama':
      return new OllamaProvider(d);
    case 'mock':
      return new MockProvider(d);
  }
}
