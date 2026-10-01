import { Kafka, type Consumer } from 'kafkajs';
import type { Logger } from 'pino';
import { validateEvent } from '@nimloth-core/shared';
import type { SinkConfig } from './config.js';

export interface AuditSinkMetrics {
  received: number;
  valid: number;
  invalid: number;
  lastEventId: string | null;
}

export class DomainEventAuditSinkConsumer {
  private readonly kafka: Kafka;
  private readonly consumer: Consumer;
  public readonly metrics: AuditSinkMetrics = {
    received: 0,
    valid: 0,
    invalid: 0,
    lastEventId: null,
  };

  constructor(
    private readonly config: SinkConfig,
    private readonly logger: Logger,
  ) {
    this.kafka = new Kafka({
      clientId: config.kafka.clientId,
      brokers: config.kafka.brokers,
      retry: { retries: 10, initialRetryTime: 300 },
    });
    this.consumer = this.kafka.consumer({
      groupId: config.kafka.groupId,
      sessionTimeout: 30000,
    });
  }

  async start(): Promise<void> {
    await this.consumer.connect();
    await this.consumer.subscribe({ topics: [this.config.topic], fromBeginning: false });
    await this.consumer.run({
      eachMessage: async ({ message }) => {
        if (!message.value) return;
        this.metrics.received += 1;
        let parsed: unknown;
        try {
          parsed = JSON.parse(message.value.toString());
        } catch {
          this.metrics.invalid += 1;
          this.logger.warn('audit-sink: invalid JSON — contract breach');
          return;
        }
        const { ok, errors } = validateEvent('compositionCommitted', parsed);
        if (!ok) {
          this.metrics.invalid += 1;
          this.logger.warn({ errors }, 'audit-sink: schema validation failed');
          return;
        }
        const eventId =
          typeof parsed === 'object' && parsed !== null && 'event_id' in parsed
            ? String((parsed as { event_id: unknown }).event_id)
            : null;
        this.metrics.valid += 1;
        this.metrics.lastEventId = eventId;
        this.logger.info(
          {
            event_id: eventId,
            composition_uid: (parsed as { payload?: { composition_uid?: string } }).payload
              ?.composition_uid,
          },
          'audit-sink: CompositionCommitted accepted',
        );
      },
    });
    this.logger.info({ topic: this.config.topic }, 'audit-sink consumer running');
  }

  async stop(): Promise<void> {
    await this.consumer.disconnect();
  }
}
