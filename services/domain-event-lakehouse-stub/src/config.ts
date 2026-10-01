import { TOPICS } from '@nimloth-core/shared';

export interface StubConfig {
  port: number;
  kafka: { brokers: string[]; clientId: string; groupId: string };
  topic: string;
  bronzePath: string;
  logLevel: string;
}

export function loadConfig(): StubConfig {
  return {
    port: Number(process.env.LAKEHOUSE_STUB_PORT ?? process.env.PORT ?? 3021),
    kafka: {
      brokers: (process.env.KAFKA_BROKERS ?? 'kafka:29092').split(',').map((s) => s.trim()),
      clientId: process.env.KAFKA_CLIENT_ID ?? 'domain-event-lakehouse-stub',
      groupId: process.env.KAFKA_GROUP_ID ?? 'domain-event-lakehouse-stub',
    },
    topic: process.env.DOMAIN_COMPOSITION_TOPIC ?? TOPICS.domain.compositionCommitted,
    bronzePath: process.env.LAKEHOUSE_BRONZE_PATH ?? '/data/bronze-composition-committed.ndjson',
    logLevel: process.env.LOG_LEVEL ?? 'info',
  };
}
