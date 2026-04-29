// ComposerKafkaConsumer — bryggar Kafka-trafik till composer_outbox.
//
// Designad för exactly-once-effekt:
//   1. Tar emot Kafka-meddelande
//   2. Parsar payload som ClinicalEvent
//   3. Skriver till outbox (UNIQUE-constraint på event_id ger idempotency)
//   4. Committar offset MANUELLT efter outbox-skrivning
//
// Outbox-processor är separat och pollar pending-rader. Det är medvetet:
// Kafka-consumern blir snabb (bara DB-write) och kan committa offset utan
// att vänta på EHRbase. Sessionstimout < EHRbase-latens om vi skulle göra
// allt i ett — Kafka skulle rebalansa.

import type { Logger } from 'pino';
import type { EachMessagePayload } from 'kafkajs';
import { NimlothConsumer } from '@nimloth-core/kafka-utils';
import type { ClinicalEvent } from '../types.js';
import type { OutboxWriter } from '../outbox/writer.js';
import { CLINICAL_TOPICS, CONSUMER_GROUP } from './topics.js';

export interface ComposerKafkaConfig {
  brokers: string[];
  /** Override consumer-group ifall flera composer-deploys ska samexistera. */
  groupId?: string;
}

export interface KafkaConsumerMetrics {
  consumedTotal: number;
  parseFailedTotal: number;
  outboxWrittenTotal: number;
  outboxAlreadyExistedTotal: number;
  lastConsumedAt: string | null;
  lastError: string | null;
}

export class ComposerKafkaConsumer {
  private readonly consumer: NimlothConsumer;
  public readonly metrics: KafkaConsumerMetrics = {
    consumedTotal: 0,
    parseFailedTotal: 0,
    outboxWrittenTotal: 0,
    outboxAlreadyExistedTotal: 0,
    lastConsumedAt: null,
    lastError: null,
  };

  constructor(
    private readonly outboxWriter: OutboxWriter,
    cfg: ComposerKafkaConfig,
    private readonly logger: Logger,
  ) {
    this.consumer = new NimlothConsumer({
      clientId: 'core-openehr-composer',
      groupId: cfg.groupId ?? CONSUMER_GROUP,
      brokers: cfg.brokers,
      topics: [...CLINICAL_TOPICS],
    });
  }

  async start(): Promise<void> {
    await this.consumer.start(async (payload) => this.handleMessage(payload));
    this.logger.info({ topics: CLINICAL_TOPICS }, 'kafka consumer running');
  }

  async stop(): Promise<void> {
    await this.consumer.stop();
  }

  isRunning(): boolean {
    return this.consumer.isRunning();
  }

  private async handleMessage({ topic, partition, message }: EachMessagePayload): Promise<void> {
    this.metrics.consumedTotal += 1;
    this.metrics.lastConsumedAt = new Date().toISOString();

    if (!message.value) {
      // Tomt meddelande — skippa men committa så vi går vidare.
      await this.consumer.commit(topic, partition, message.offset);
      return;
    }

    let event: ClinicalEvent;
    try {
      event = JSON.parse(message.value.toString()) as ClinicalEvent;
    } catch (err) {
      this.metrics.parseFailedTotal += 1;
      this.metrics.lastError = String(err);
      this.logger.warn(
        { topic, partition, offset: message.offset, err: String(err) },
        'failed to parse kafka message — skipping',
      );
      // Malformat — committa offset så vi inte fastnar i loop.
      await this.consumer.commit(topic, partition, message.offset);
      return;
    }

    if (!event.event_id || !event.event_type || !event.patient_pnr) {
      this.metrics.parseFailedTotal += 1;
      this.logger.warn(
        { topic, partition, offset: message.offset, event_id: event.event_id },
        'kafka message missing required ClinicalEvent fields — skipping',
      );
      await this.consumer.commit(topic, partition, message.offset);
      return;
    }

    // Skriv till outbox FÖRE offset-commit. UNIQUE-constraint hanterar dubletter.
    try {
      const result = await this.outboxWriter.write(event, 'kafka', {
        topic,
        partition,
        offset: message.offset,
      });
      if (result.created) this.metrics.outboxWrittenTotal += 1;
      else this.metrics.outboxAlreadyExistedTotal += 1;
    } catch (err) {
      // Outbox-skrivningen failade. Vi committar INTE offset — på nästa körning
      // konsumeras samma message och vi försöker igen. Logga och re-throw.
      this.metrics.lastError = String(err);
      this.logger.error(
        { topic, partition, offset: message.offset, err: String(err) },
        'outbox write failed — offset NOT committed, will retry on next consumption',
      );
      throw err;
    }

    await this.consumer.commit(topic, partition, message.offset);
  }
}
