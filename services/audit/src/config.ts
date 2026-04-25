export interface AuditConfig {
  port: number;
  kafka: { brokers: string[]; clientId: string; groupId: string };
  db: { host: string; port: number; database: string; user: string; password: string };
  topic: string;
  batch: { maxSize: number; maxLatencyMs: number };
  logLevel: string;
  /** Krävs admin-roll för REST-API:et. Kan stängas av i dev med ENFORCE_ADMIN=false. */
  enforceAdmin: boolean;
}

export function loadConfig(): AuditConfig {
  return {
    port: Number(process.env.AUDIT_PORT ?? process.env.PORT ?? 3005),
    kafka: {
      brokers: (process.env.KAFKA_BROKERS ?? 'kafka:29092').split(',').map((s) => s.trim()),
      clientId: process.env.KAFKA_CLIENT_ID ?? 'core-audit',
      groupId: process.env.KAFKA_GROUP_ID ?? 'core-audit-group',
    },
    db: {
      host: process.env.CORE_DB_HOST ?? 'core-db',
      port: Number(process.env.CORE_DB_PORT ?? 5432),
      database: process.env.CORE_DB_NAME ?? 'core',
      user: process.env.CORE_DB_USER ?? 'core',
      password: process.env.CORE_DB_PASSWORD ?? 'core',
    },
    topic: process.env.AUDIT_TOPIC ?? 'core.audit.access',
    batch: {
      maxSize: Number(process.env.AUDIT_BATCH_SIZE ?? 100),
      maxLatencyMs: Number(process.env.AUDIT_BATCH_LATENCY_MS ?? 1000),
    },
    logLevel: process.env.LOG_LEVEL ?? 'info',
    enforceAdmin: process.env.ENFORCE_ADMIN === 'true',
  };
}
