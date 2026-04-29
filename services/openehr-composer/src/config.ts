// Konfig för openehr-composer. Följer mönster från services/audit/.

export interface ComposerConfig {
  port: number;
  ehrbase: { baseUrl: string };
  db: { host: string; port: number; database: string; user: string; password: string };
  kafka: {
    enabled: boolean;
    brokers: string[];
    groupId: string;
  };
  outbox: {
    pollIntervalMs: number;
    batchSize: number;
    maxAttempts: number;
  };
  /** Vilka templates composern förväntar sig finnas i EHRbase. Ifall någon
   *  saknas vid startup loggas det men tjänsten startar ändå (warn-mode). */
  expectedTemplateIds: string[];
  logLevel: string;
}

export function loadConfig(): ComposerConfig {
  return {
    port: Number(process.env.COMPOSER_PORT ?? process.env.PORT ?? 3015),
    ehrbase: {
      baseUrl: process.env.EHRBASE_URL ?? 'http://ehrbase:8080',
    },
    db: {
      host: process.env.CORE_DB_HOST ?? 'core-db',
      port: Number(process.env.CORE_DB_PORT ?? 5432),
      database: process.env.CORE_DB_NAME ?? 'core',
      user: process.env.CORE_DB_USER ?? 'core',
      password: process.env.CORE_DB_PASSWORD ?? 'core',
    },
    kafka: {
      // Sätt KAFKA_ENABLED=false för att stänga av consumer (HTTP-route fungerar ändå).
      enabled: process.env.KAFKA_ENABLED !== 'false',
      brokers: (process.env.KAFKA_BROKERS ?? 'kafka:29092')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      groupId: process.env.KAFKA_GROUP_ID ?? 'core-openehr-composer',
    },
    outbox: {
      pollIntervalMs: Number(process.env.OUTBOX_POLL_INTERVAL_MS ?? 1000),
      batchSize: Number(process.env.OUTBOX_BATCH_SIZE ?? 10),
      maxAttempts: Number(process.env.OUTBOX_MAX_ATTEMPTS ?? 5),
    },
    expectedTemplateIds: (process.env.EXPECTED_TEMPLATES ?? 'time_series.en.v1,minimal_action.en.v1')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    logLevel: process.env.LOG_LEVEL ?? 'info',
  };
}
