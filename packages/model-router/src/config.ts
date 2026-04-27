// YAML-loader för model-routing-config. Validerar topologin: providers existerar,
// routing-regler refererar definierade providers/modeller, sensitivity-värden
// är giltiga, och `phi`-regler tvingar fram require: 'on-premise'.

import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import type { RouterConfig, RoutingRule, ProviderDescriptor, Sensitivity } from './types.js';

const VALID_SENSITIVITY: Sensitivity[] = ['public', 'schema-only', 'pii', 'phi'];
const VALID_PROVIDER_TYPES = ['anthropic', 'ollama', 'mock'] as const;
const VALID_RESIDENCY = ['us-cloud', 'eu-cloud', 'on-premise'] as const;

export function loadRouterConfig(path: string): RouterConfig {
  const raw = readFileSync(path, 'utf-8');
  const parsed = parse(raw) as Partial<RouterConfig> | null;
  if (!parsed) throw new Error(`Empty router config at ${path}`);
  return validateConfig(parsed, path);
}

export function validateConfig(input: unknown, source: string = '<inline>'): RouterConfig {
  if (!input || typeof input !== 'object') {
    throw new Error(`${source}: config must be an object`);
  }
  const obj = input as Record<string, unknown>;
  const providersRaw = obj.providers;
  const routingRaw = obj.routing;
  if (!Array.isArray(providersRaw)) {
    throw new Error(`${source}: providers must be an array`);
  }
  if (!Array.isArray(routingRaw)) {
    throw new Error(`${source}: routing must be an array`);
  }

  const providers = providersRaw.map((p, i) => validateProvider(p, `${source}.providers[${i}]`));
  const providerById = new Map(providers.map((p) => [p.id, p]));
  const routing = routingRaw.map((r, i) =>
    validateRule(r, providerById, `${source}.routing[${i}]`),
  );

  return { providers, routing };
}

function validateProvider(input: unknown, source: string): ProviderDescriptor {
  if (!input || typeof input !== 'object') {
    throw new Error(`${source}: must be an object`);
  }
  const o = input as Record<string, unknown>;
  if (typeof o.id !== 'string' || !o.id) throw new Error(`${source}: id required`);
  if (!VALID_PROVIDER_TYPES.includes(o.type as (typeof VALID_PROVIDER_TYPES)[number])) {
    throw new Error(`${source}: type must be one of ${VALID_PROVIDER_TYPES.join(',')}`);
  }
  if (!Array.isArray(o.models) || o.models.length === 0) {
    throw new Error(`${source}: models must be non-empty array`);
  }
  for (const m of o.models) {
    if (typeof m !== 'string') throw new Error(`${source}: models entries must be strings`);
  }
  if (!VALID_RESIDENCY.includes(o.dataResidency as (typeof VALID_RESIDENCY)[number])) {
    throw new Error(`${source}: dataResidency must be one of ${VALID_RESIDENCY.join(',')}`);
  }
  return {
    id: o.id,
    type: o.type as ProviderDescriptor['type'],
    enabled: o.enabled !== false,
    models: o.models as string[],
    dataResidency: o.dataResidency as ProviderDescriptor['dataResidency'],
    requiresInternet: Boolean(o.requiresInternet),
    config: (o.config as Record<string, unknown>) ?? {},
  };
}

function validateRule(
  input: unknown,
  providers: Map<string, ProviderDescriptor>,
  source: string,
): RoutingRule {
  if (!input || typeof input !== 'object') {
    throw new Error(`${source}: must be an object`);
  }
  const o = input as Record<string, unknown>;
  if (typeof o.task !== 'string' || !o.task) throw new Error(`${source}: task required`);
  if (!VALID_SENSITIVITY.includes(o.sensitivity as Sensitivity)) {
    throw new Error(`${source}: sensitivity must be one of ${VALID_SENSITIVITY.join(',')}`);
  }
  const sensitivity = o.sensitivity as Sensitivity;

  const require = o.require as RoutingRule['require'] | undefined;
  if (require && !VALID_RESIDENCY.includes(require)) {
    throw new Error(`${source}: require must be one of ${VALID_RESIDENCY.join(',')}`);
  }

  // Hard rule: phi-tasks måste explicit kräva on-premise. Annars hade
  // en konfigurations-glipa kunnat skicka vårddata till cloud-providers.
  if (sensitivity === 'phi' && require !== 'on-premise') {
    throw new Error(
      `${source}: tasks with sensitivity=phi MUST set require: on-premise (got ${require ?? 'undefined'})`,
    );
  }

  const prefer = parseRefs(o.prefer, providers, `${source}.prefer`);
  const fallback = parseRefs(o.fallback ?? [], providers, `${source}.fallback`);

  return {
    task: o.task,
    sensitivity,
    require,
    prefer,
    fallback,
  };
}

function parseRefs(
  input: unknown,
  providers: Map<string, ProviderDescriptor>,
  source: string,
): RoutingRule['prefer'] {
  if (!Array.isArray(input)) throw new Error(`${source}: must be an array`);
  return input.map((r, i) => {
    if (!r || typeof r !== 'object') throw new Error(`${source}[${i}]: must be an object`);
    const ref = r as Record<string, unknown>;
    if (typeof ref.providerId !== 'string') {
      throw new Error(`${source}[${i}]: providerId required`);
    }
    if (typeof ref.model !== 'string') {
      throw new Error(`${source}[${i}]: model required`);
    }
    const p = providers.get(ref.providerId);
    if (!p) {
      throw new Error(`${source}[${i}]: providerId "${ref.providerId}" not defined in providers[]`);
    }
    if (!p.models.includes(ref.model)) {
      throw new Error(
        `${source}[${i}]: model "${ref.model}" not declared by provider "${ref.providerId}". Declared: ${p.models.join(', ')}`,
      );
    }
    return { providerId: ref.providerId, model: ref.model };
  });
}
