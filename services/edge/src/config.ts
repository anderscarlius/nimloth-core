// Edge-nod konfiguration — läses från env vid startup.

export interface EdgeConfig {
  instanceId: string;
  instanceName: string;
  hospitalName: string;
  hsaId: string;

  logLevel: string;

  localKafka: {
    brokers: string[];
    clientId: string;
  };

  centralKafka: {
    brokers: string[];
    clientId: string;
  };

  centralHub: {
    fhirBaseUrl: string;
    healthUrl: string;
  };

  fhirCache: {
    sqlitePath: string;
  };

  ports: {
    fhir: number;
    cds: number;
    status: number;
  };

  offline: {
    pingIntervalMs: number;
    pingTimeoutMs: number;
    maxRetries: number;
    syncBatchSize: number;
  };

  hydration: {
    kafkaSnapshotTimeoutMs: number;
    httpFallbackEnabled: boolean;
  };
}

function requireEnv(name: string, fallback?: string): string {
  const v = process.env[name];
  if (v && v.length > 0) return v;
  if (fallback !== undefined) return fallback;
  throw new Error(`Required env var missing: ${name}`);
}

function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number(v);
  if (Number.isNaN(n)) throw new Error(`Env var ${name} must be a number, got: ${v}`);
  return n;
}

function bool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined) return fallback;
  return v === 'true' || v === '1';
}

export function loadEdgeConfig(): EdgeConfig {
  const instanceId = requireEnv('EDGE_INSTANCE_ID', 'su');
  return {
    instanceId,
    instanceName: requireEnv('EDGE_INSTANCE_NAME', `Melior ${instanceId.toUpperCase()}`),
    hospitalName: requireEnv('EDGE_HOSPITAL_NAME', 'Sahlgrenska Universitetssjukhuset'),
    hsaId: requireEnv('EDGE_HSA_ID', 'SE2321000131-E000000000001'),

    logLevel: requireEnv('LOG_LEVEL', 'info'),

    localKafka: {
      brokers: requireEnv('LOCAL_KAFKA_BROKERS', 'edge-kafka-su:29092')
        .split(',')
        .map((s) => s.trim()),
      clientId: `core-edge-${instanceId}`,
    },

    centralKafka: {
      brokers: requireEnv('CENTRAL_KAFKA_BROKERS', 'kafka:29092')
        .split(',')
        .map((s) => s.trim()),
      clientId: `core-edge-${instanceId}-to-central`,
    },

    centralHub: {
      fhirBaseUrl: requireEnv('CENTRAL_FHIR_URL', 'http://fhir-facade:3003'),
      healthUrl: requireEnv('CENTRAL_HEALTH_URL', 'http://fhir-facade:3003/health'),
    },

    fhirCache: {
      sqlitePath: requireEnv('FHIR_CACHE_DB', '/data/fhir-cache.db'),
    },

    ports: {
      fhir: num('EDGE_FHIR_PORT', 3003),
      cds: num('EDGE_CDS_PORT', 3004),
      status: num('EDGE_STATUS_PORT', 3006),
    },

    offline: {
      pingIntervalMs: num('EDGE_PING_INTERVAL_MS', 5000),
      pingTimeoutMs: num('EDGE_PING_TIMEOUT_MS', 3000),
      maxRetries: num('EDGE_PING_MAX_RETRIES', 3),
      syncBatchSize: num('EDGE_SYNC_BATCH_SIZE', 1000),
    },

    hydration: {
      kafkaSnapshotTimeoutMs: num('EDGE_HYDRATION_KAFKA_TIMEOUT_MS', 10_000),
      httpFallbackEnabled: bool('EDGE_HYDRATION_HTTP_FALLBACK', true),
    },
  };
}
