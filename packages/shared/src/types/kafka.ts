// Kafka producer/consumer-konfigurationstyper.
// Fristående typer (importeras inte kafkajs här — det gör varje service själv).

export interface KafkaBrokerConfig {
  brokers: string[];
  clientId: string;
  ssl?: boolean;
  sasl?: {
    mechanism: 'plain' | 'scram-sha-256' | 'scram-sha-512';
    username: string;
    password: string;
  };
}

export interface KafkaProducerConfig {
  /** ACK-strategi. 'all' = wait för alla replikor (säkrast). */
  acks?: 'all' | 1 | 0;
  /** Idempotens förhindrar duplicates vid retries. */
  idempotent?: boolean;
  /** Max batch-storlek i bytes. */
  batchSize?: number;
  /** Komprimeringstyp. */
  compression?: 'gzip' | 'snappy' | 'lz4' | 'zstd';
}

export interface KafkaConsumerConfig {
  groupId: string;
  /** Från vilken offset börja konsumera om consumer group är ny. */
  fromBeginning?: boolean;
  /** Session timeout i ms. */
  sessionTimeout?: number;
}

export interface MessageHeaders {
  'content-type'?: string;
  'schema-id'?: string;
  'event-type'?: string;
  'correlation-id'?: string;
  'x-edge-instance'?: string;
  'x-edge-timestamp'?: string;
  'x-aggregated-at'?: string;
  [key: string]: string | undefined;
}
