// Terminologi-tjänstens konfiguration.

export interface UpstreamConfig {
  /** Snowstorm REST URL, t.ex. http://snowstorm:8080/fhir. Tom = ej konfigurerad. */
  snowstormUrl: string;
  /** HAPI FHIR Terminology REST URL. Tom = ej konfigurerad. */
  hapiTerminologyUrl: string;
  /** Timeout för upstream-anrop (ms). */
  timeoutMs: number;
}

export interface TerminologyConfig {
  port: number;
  logLevel: string;
  cache: {
    maxSize: number;
    ttlMs: number;
  };
  upstream: UpstreamConfig;
  fallbackPath: string;
}

function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number(v);
  if (Number.isNaN(n)) throw new Error(`Env ${name} must be a number, got: ${v}`);
  return n;
}

export function loadConfig(): TerminologyConfig {
  return {
    port: num('TERMINOLOGY_PORT', 3008),
    logLevel: process.env.LOG_LEVEL ?? 'info',
    cache: {
      maxSize: num('TERMINOLOGY_CACHE_MAX', 10_000),
      // 24h default — terminologi-koder ändras sällan.
      ttlMs: num('TERMINOLOGY_CACHE_TTL_MS', 24 * 60 * 60 * 1000),
    },
    upstream: {
      snowstormUrl: process.env.SNOWSTORM_URL ?? '',
      hapiTerminologyUrl: process.env.HAPI_TERMINOLOGY_URL ?? '',
      timeoutMs: num('TERMINOLOGY_UPSTREAM_TIMEOUT_MS', 3_000),
    },
    fallbackPath: process.env.TERMINOLOGY_FALLBACK_PATH ?? './data/terminology-fallback.json',
  };
}
