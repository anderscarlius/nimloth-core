// Kafka consumer för core.audit.access — delegerar till AuditStore för batch-insert.

import { Kafka, type Consumer } from 'kafkajs';
import type { Logger } from 'pino';
import type { AuditConfig } from './config.js';
import type { AuditStore } from './store.js';
import type { AuditEventMessage } from './types.js';

export class AuditConsumer {
  private readonly kafka: Kafka;
  private readonly consumer: Consumer;
  public received = 0;
  public errors = 0;

  constructor(
    private readonly config: AuditConfig,
    private readonly store: AuditStore,
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
      heartbeatInterval: 3000,
    });
  }

  async start(): Promise<void> {
    await this.consumer.connect();
    this.logger.info({ topic: this.config.topic }, 'Subscribing to audit topic');
    await this.consumer.subscribe({ topics: [this.config.topic], fromBeginning: true });
    await this.consumer.run({
      eachMessage: async ({ message }) => {
        if (!message.value) return;
        try {
          const event = JSON.parse(message.value.toString()) as AuditEventMessage;
          if (!event.event_id || !event.timestamp) {
            this.logger.warn({ event }, 'Skipping audit event without event_id/timestamp');
            return;
          }
          this.store.add(event);
          this.received++;
        } catch (err) {
          this.errors++;
          this.logger.error({ err }, 'Failed to parse audit event');
        }
      },
    });
    this.logger.info('Audit consumer running');
  }

  async stop(): Promise<void> {
    await this.consumer.disconnect();
  }
}
