// Publicerar CompositionCommitted v1 på core.domain.composition.committed
// efter lyckad EHRbase-commit. Observability — får inte blockera CDR-skrivning.

import { Kafka, type Producer } from 'kafkajs';
import type { Logger } from 'pino';
import {
  buildCompositionCommittedEvent,
  COMPOSITION_COMMITTED_EVENT_TYPE,
  TOPICS,
} from '@nimloth-core/shared';
import type { ClinicalEvent } from '../types.js';

export interface DomainEventPublisherConfig {
  brokers: string[];
  clientId: string;
  topic: string;
  enabled: boolean;
}

export interface CompositionCommittedPublisher {
  publishAfterCommit(
    trigger: ClinicalEvent,
    compositionUid: string,
    ehrId: string,
    templateId: string,
  ): Promise<void>;
  stop(): Promise<void>;
}

function isKafkaDisabled(brokers: string[]): boolean {
  if (brokers.length === 0) return true;
  const first = (brokers[0] ?? '').trim().toLowerCase();
  return first === '' || first === 'disabled';
}

class KafkaCompositionCommittedPublisher implements CompositionCommittedPublisher {
  private kafka: Kafka | null = null;
  private producer: Producer | null = null;
  private connected = false;
  public publishedTotal = 0;
  public failedTotal = 0;

  constructor(
    private readonly cfg: DomainEventPublisherConfig,
    private readonly logger: Logger,
  ) {}

  private ensureProducer(): Producer {
    if (this.producer) return this.producer;
    this.kafka = new Kafka({
      clientId: this.cfg.clientId,
      brokers: this.cfg.brokers,
      retry: { retries: 3, initialRetryTime: 300 },
    });
    this.producer = this.kafka.producer({ idempotent: true });
    return this.producer;
  }

  async publishAfterCommit(
    trigger: ClinicalEvent,
    compositionUid: string,
    ehrId: string,
    templateId: string,
  ): Promise<void> {
    if (!this.cfg.enabled || isKafkaDisabled(this.cfg.brokers)) {
      return;
    }
    const event = buildCompositionCommittedEvent({
      patient_id: trigger.patient_id,
      composition_uid: compositionUid,
      ehr_id: ehrId,
      template_id: templateId,
      trigger_event_id: trigger.event_id,
      trigger_event_type: trigger.event_type,
      correlation_id: trigger.event_id,
    });
    if (event.event_type !== COMPOSITION_COMMITTED_EVENT_TYPE) {
      this.logger.error({ event_type: event.event_type }, 'unexpected domain event type');
      return;
    }
    try {
      const producer = this.ensureProducer();
      if (!this.connected) {
        await producer.connect();
        this.connected = true;
      }
      await producer.send({
        topic: this.cfg.topic,
        messages: [
          {
            key: trigger.patient_id,
            value: JSON.stringify(event),
          },
        ],
      });
      this.publishedTotal += 1;
    } catch (err) {
      this.failedTotal += 1;
      this.logger.warn(
        { err: String(err), trigger_event_id: trigger.event_id, topic: this.cfg.topic },
        'CompositionCommitted publish failed — CDR write already succeeded',
      );
    }
  }

  async stop(): Promise<void> {
    if (this.connected && this.producer) {
      await this.producer.disconnect().catch(() => undefined);
    }
    this.connected = false;
  }
}

class NoopCompositionCommittedPublisher implements CompositionCommittedPublisher {
  async publishAfterCommit(): Promise<void> {
    /* disabled */
  }
  async stop(): Promise<void> {
    /* noop */
  }
}

export function createCompositionCommittedPublisher(
  cfg: DomainEventPublisherConfig,
  logger: Logger,
): CompositionCommittedPublisher {
  if (!cfg.enabled || isKafkaDisabled(cfg.brokers)) {
    logger.info('domain event publisher disabled — CompositionCommitted will not be emitted');
    return new NoopCompositionCommittedPublisher();
  }
  logger.info({ topic: cfg.topic }, 'domain event publisher enabled');
  return new KafkaCompositionCommittedPublisher(cfg, logger);
}

export function defaultDomainPublisherConfig(
  brokers: string[],
  enabled = true,
): DomainEventPublisherConfig {
  return {
    brokers,
    clientId: process.env.KAFKA_DOMAIN_CLIENT_ID ?? 'core-openehr-composer-domain',
    topic: process.env.DOMAIN_COMPOSITION_TOPIC ?? TOPICS.domain.compositionCommitted,
    enabled: enabled && process.env.DOMAIN_EVENTS_ENABLED !== 'false',
  };
}
