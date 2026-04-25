// Konfiguration från miljövariabler.

export interface IngestConfig {
  instanceId: string;
  port: number;
  kafka: {
    brokers: string[];
    clientId: string;
    groupId: string;
  };
  cdc: {
    /** Prefix som Debezium använder (vgr.cdc.melior.<instance>). */
    topicPrefix: string;
    /** Topic för republicerade raw-events. */
    rawTopic: string;
  };
  logLevel: string;
}

export function loadConfig(): IngestConfig {
  const instanceId = process.env.MELIOR_INSTANCE_ID ?? 'su';
  const topicPrefix = process.env.CDC_TOPIC_PREFIX ?? `vgr.cdc.melior.${instanceId}`;

  return {
    instanceId,
    port: Number(process.env.INGEST_PORT ?? process.env.PORT ?? 3001),
    kafka: {
      brokers: (process.env.KAFKA_BROKERS ?? 'kafka:29092').split(',').map((s) => s.trim()),
      clientId: process.env.KAFKA_CLIENT_ID ?? 'core-ingest',
      groupId: process.env.KAFKA_GROUP_ID ?? 'core-ingest-group',
    },
    cdc: {
      topicPrefix,
      rawTopic: `${topicPrefix}.raw`,
    },
    logLevel: process.env.LOG_LEVEL ?? 'info',
  };
}
