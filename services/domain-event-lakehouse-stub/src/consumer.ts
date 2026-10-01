import { appendFile } from 'node:fs/promises';
import { Kafka, type Consumer } from 'kafkajs';
import type { Logger } from 'pino';
import { validateEvent, type CompositionCommittedEvent } from '@nimloth-core/shared';
import {
  buildBronzeCompositionRecord,
  buildSilverBodyTemperatureRow,
  canBuildSilverBodyTemperature,
  ClinicalVitalsCache,
  serializeBronzeLine,
  serializeSilverLine,
} from '@nimloth-core/lakehouse-pipeline';
import type { StubConfig } from './config.js';

export interface LakehouseStubMetrics {
  clinicalCached: number;
  received: number;
  bronzeAppended: number;
  silverAppended: number;
  rejected: number;
  silverSkippedNoJoin: number;
}

export class DomainEventLakehouseStubConsumer {
  private readonly kafka: Kafka;
  private readonly consumer: Consumer;
  private readonly vitalsCache = new ClinicalVitalsCache();
  public readonly metrics: LakehouseStubMetrics = {
    clinicalCached: 0,
    received: 0,
    bronzeAppended: 0,
    silverAppended: 0,
    rejected: 0,
    silverSkippedNoJoin: 0,
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
    await this.consumer.subscribe({
      topics: [this.config.domainTopic, this.config.clinicalVitalsTopic],
      fromBeginning: false,
    });
    await this.consumer.run({
      eachMessage: async ({ topic, message }) => {
        if (!message.value) return;
        let parsed: unknown;
        try {
          parsed = JSON.parse(message.value.toString());
        } catch {
          this.metrics.rejected += 1;
          this.logger.warn({ topic }, 'lakehouse-stub: invalid JSON');
          return;
        }

        if (topic === this.config.clinicalVitalsTopic) {
          if (this.vitalsCache.rememberFromKafkaMessage(parsed)) {
            this.metrics.clinicalCached += 1;
          }
          return;
        }

        if (topic !== this.config.domainTopic) {
          return;
        }

        this.metrics.received += 1;
        const { ok, errors } = validateEvent('compositionCommitted', parsed);
        if (!ok) {
          this.metrics.rejected += 1;
          this.logger.warn({ errors }, 'lakehouse-stub: contract breach — not appended');
          return;
        }
        const event = parsed as CompositionCommittedEvent;
        const bronze = buildBronzeCompositionRecord(event);
        await appendFile(this.config.bronzePath, serializeBronzeLine(bronze), 'utf8');
        this.metrics.bronzeAppended += 1;

        if (!canBuildSilverBodyTemperature(bronze)) {
          return;
        }
        const vital = this.vitalsCache.lookupForCompositionTrigger(
          event.payload.trigger_event_id,
          event.payload.trigger_event_type,
        );
        if (!vital) {
          this.metrics.silverSkippedNoJoin += 1;
          return;
        }
        const silver = buildSilverBodyTemperatureRow(bronze, vital);
        await appendFile(this.config.silverPath, serializeSilverLine(silver), 'utf8');
        this.metrics.silverAppended += 1;
      },
    });
    this.logger.info(
      {
        domainTopic: this.config.domainTopic,
        clinicalVitalsTopic: this.config.clinicalVitalsTopic,
        bronzePath: this.config.bronzePath,
        silverPath: this.config.silverPath,
      },
      'lakehouse-stub consumer running (bronze + silver smoke)',
    );
  }

  async stop(): Promise<void> {
    await this.consumer.disconnect();
  }
}
