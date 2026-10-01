import { TOPICS } from '@nimloth-core/shared';

export interface SinkConfig {
  port: number;
  kafka: { brokers: string[]; clientId: string; groupId: string };
  topic: string;
  logLevel: string;
}

export function loadConfig(): SinkConfig {
  return {
    port: Number(process.env.DOMAIN_AUDIT_SINK_PORT ?? process.env.PORT ?? 3020),
    kafka: {
      brokers: (process.env.KAFKA_BROKERS ?? 'kafka:29092').split(',').map((s) => s.trim()),
      clientId: process.env.KAFKA_CLIENT_ID ?? 'domain-event-audit-sink',
      groupId: process.env.KAFKA_GROUP_ID ?? 'domain-event-audit-sink',
    },
    topic: process.env.DOMAIN_COMPOSITION_TOPIC ?? TOPICS.domain.compositionCommitted,
    logLevel: process.env.LOG_LEVEL ?? 'info',
  };
}
