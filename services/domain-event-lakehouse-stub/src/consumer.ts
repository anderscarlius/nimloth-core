import { appendFile } from 'node:fs/promises';
import { Kafka, type Consumer } from 'kafkajs';
import type { Logger } from 'pino';
import { validateEvent, type CompositionCommittedEvent } from '@nimloth-core/shared';
import type { StubConfig } from './config.js';

export interface LakehouseStubMetrics {
  received: number;
  appended: number;
  rejected: number;
}

export class DomainEventLakehouseStubConsumer {
  private readonly kafka: Kafka;
  private readonly consumer: Consumer;
  public readonly metrics: LakehouseStubMetrics = {
    received: 0,
    appended: 0,
    rejected: 0,
  };

  constructor(
    private readonly config: StubConfig,
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
          this.metrics.rejected += 1;
          this.logger.warn('lakehouse-stub: invalid JSON');
          return;
        }
        const { ok, errors } = validateEvent('compositionCommitted', parsed);
        if (!ok) {
          this.metrics.rejected += 1;
          this.logger.warn({ errors }, 'lakehouse-stub: contract breach — not appended');
          return;
        }
        const event = parsed as CompositionCommittedEvent;
        const bronzeRow = {
          ingested_at: new Date().toISOString(),
          event_id: event.event_id,
          composition_uid: event.payload.composition_uid,
          ehr_id: event.payload.ehr_id,
          template_id: event.payload.template_id,
          patient_id: event.patient_id,
          trigger_event_id: event.payload.trigger_event_id,
        };
        await appendFile(this.config.bronzePath, `${JSON.stringify(bronzeRow)}\n`, 'utf8');
        this.metrics.appended += 1;
      },
    });
    this.logger.info(
      { topic: this.config.topic, bronzePath: this.config.bronzePath },
      'lakehouse-stub consumer running',
    );
  }

  async stop(): Promise<void> {
    await this.consumer.disconnect();
  }
}
