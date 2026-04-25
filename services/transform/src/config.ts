// Transform-tjänst konfiguration.

export interface DbCfg {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

export interface TransformConfig {
  instanceId: string;
  port: number;
  kafka: {
    brokers: string[];
    clientId: string;
    groupId: string;
  };
  /** Raw-topics att konsumera (source-CDC-events efter ingest-normalisering). */
  rawTopics: string[];
  /** Direktaccess mot källsystem för pre-population av patient-cache. */
  meliorDb: DbCfg | null;
  asynjaDb: DbCfg | null;
  logLevel: string;
}

export function loadConfig(): TransformConfig {
  const instanceId = process.env.MELIOR_INSTANCE_ID ?? 'su';
  return {
    instanceId,
    port: Number(process.env.TRANSFORM_PORT ?? process.env.PORT ?? 3002),
    kafka: {
      brokers: (process.env.KAFKA_BROKERS ?? 'kafka:29092').split(',').map((s) => s.trim()),
      clientId: process.env.KAFKA_CLIENT_ID ?? 'core-transform',
      groupId: process.env.KAFKA_GROUP_ID ?? 'core-transform-group',
    },
    rawTopics: (process.env.TRANSFORM_RAW_TOPICS ?? `vgr.cdc.melior.${instanceId}.raw,vgr.cdc.asynja.raw`)
      .split(',')
      .map((s) => s.trim()),
    meliorDb: process.env.MELIOR_DB_HOST
      ? {
          host: process.env.MELIOR_DB_HOST,
          port: Number(process.env.MELIOR_DB_PORT ?? 5432),
          database: process.env.MELIOR_DB_NAME ?? 'melior',
          user: process.env.MELIOR_DB_USER ?? 'melior',
          password: process.env.MELIOR_DB_PASSWORD ?? 'melior',
        }
      : null,
    asynjaDb: process.env.ASYNJA_DB_HOST
      ? {
          host: process.env.ASYNJA_DB_HOST,
          port: Number(process.env.ASYNJA_DB_PORT ?? 5432),
          database: process.env.ASYNJA_DB_NAME ?? 'asynja',
          user: process.env.ASYNJA_DB_USER ?? 'asynja',
          password: process.env.ASYNJA_DB_PASSWORD ?? 'asynja',
        }
      : null,
    logLevel: process.env.LOG_LEVEL ?? 'info',
  };
}
