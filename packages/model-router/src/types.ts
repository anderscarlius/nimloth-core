// Kärntyper för model-router. Designen ska överleva Sprint 3 (PDL/Sambi),
// Sprint 5 (CDS-text) och eventuell flytt till egen hårdvara med öppna modeller.
//
// Sensitivity-nivåerna är medvetet inspirerade av VGR:s informationsklassning:
//   - public:      ingen restriktion (publika referenser, dokumentation)
//   - schema-only: tabellnamn, kolumnnamn, syntetiska samples (ingen riktig data)
//   - synthetic:   data ser ut som riktig vårddata men är fabricerad (t.ex.
//                  eval-paren, demo-fixtures). Tillåter cloud-routing eftersom
//                  ingen riktig patient-data exponeras. Styrs i composition-
//                  mapper via NIMLOTH_DATA_MODE-env (B22.5).
//   - pii:         personidentifierare utan vårdsammanhang
//   - phi:         vårddata kopplad till individ (måste stanna on-premise)
//
// `phi` får ALDRIG routas till en provider med dataResidency != on-premise.
// Det är en hard rule, inte en preferens.

export type DataResidency = 'us-cloud' | 'eu-cloud' | 'on-premise';
export type ProviderType = 'anthropic' | 'ollama' | 'mock';
export type Sensitivity = 'public' | 'schema-only' | 'synthetic' | 'pii' | 'phi';

export interface ProviderDescriptor {
  id: string;
  type: ProviderType;
  /** Tjänsten kan referera providern men disable:a den temporärt utan att riva ut routing-regler. */
  enabled: boolean;
  /** Modellnamn som providern accepterar. Får överlappa mellan providers (t.ex. samma open-weights-modell på flera Ollama-instanser). */
  models: string[];
  dataResidency: DataResidency;
  requiresInternet: boolean;
  /** Provider-specifik config. Anthropic: { apiKeyEnv }. Ollama: { endpoint }. Mock: { fixturesPath? }. */
  config: Record<string, unknown>;
}

export interface ProviderModelRef {
  providerId: string;
  model: string;
}

export interface RoutingRule {
  task: string;
  sensitivity: Sensitivity;
  /**
   * När satt: routern accepterar BARA providers med matchande dataResidency.
   * För `phi`-tasks ska detta alltid vara 'on-premise' (router validerar detta).
   */
  require?: DataResidency;
  prefer: ProviderModelRef[];
  fallback: ProviderModelRef[];
}

export interface RouterConfig {
  providers: ProviderDescriptor[];
  routing: RoutingRule[];
}

export interface InvokeRequest {
  /** Logiskt task-namn (t.ex. 'mapping.propose') — slås upp i routing-regler. */
  task: string;
  systemPrompt: string;
  userPrompt: string;
  /** Markerar känslighetsnivå för data som skickas i prompten. Måste matcha routing-regelns sensitivity. */
  sensitivity: Sensitivity;
  maxTokens?: number;
  temperature?: number;
}

export interface InvokeResponse {
  text: string;
  modelUsed: string;
  providerId: string;
  providerType: ProviderType;
  dataResidency: DataResidency;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  /** SHA256(systemPrompt + '\n---\n' + userPrompt). Används för audit och proveniens. */
  promptHash: string;
  startedAt: string;
  completedAt: string;
}

export interface Provider {
  readonly descriptor: ProviderDescriptor;
  invoke(model: string, req: InvokeRequest): Promise<{
    text: string;
    inputTokens: number;
    outputTokens: number;
  }>;
  isHealthy(): Promise<boolean>;
}

/**
 * Audit-event som routern emitterar per anrop. Konsumeras av tjänster som
 * vill skriva till `core.audit.<topic>` (t.ex. mapping-assistant skriver till
 * core.audit.mapping).
 */
export interface RouterAuditEvent {
  task: string;
  providerId: string;
  providerType: ProviderType;
  modelUsed: string;
  dataResidency: DataResidency;
  sensitivity: Sensitivity;
  promptHash: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  startedAt: string;
  completedAt: string;
  outcome: 'success' | 'error' | 'route-unavailable';
  errorMessage?: string;
}

export class RouteUnavailableError extends Error {
  constructor(
    public readonly task: string,
    public readonly reason: string,
    public readonly attempted: ProviderModelRef[],
  ) {
    super(`No provider available for task "${task}": ${reason}`);
    this.name = 'RouteUnavailableError';
  }
}

export class SensitivityViolationError extends Error {
  constructor(
    public readonly task: string,
    public readonly sensitivity: Sensitivity,
    public readonly providerId: string,
    public readonly residency: DataResidency,
  ) {
    super(
      `Sensitivity violation: task "${task}" with sensitivity "${sensitivity}" cannot route to provider "${providerId}" (residency=${residency})`,
    );
    this.name = 'SensitivityViolationError';
  }
}
