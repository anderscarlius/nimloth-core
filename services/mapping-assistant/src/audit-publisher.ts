// Audit-publisher: drainar audit_outbox → core.audit.mapping (Kafka).
//
// Designprinciper:
//   - Tjänsten kan starta utan Kafka. Vid uppstart pekar `kafka.brokers`-config
//     på något, men misslyckande att connecta är inte fatalt — events ackumuleras
//     i outbox och drainas när nästa drain-tick lyckas.
//   - Idempotency: event_id är primary key i Kafka-meddelandet. Om publicering
//     misslyckas mid-flight ligger eventet kvar i outbox (markAuditFailed).
//   - Ingen back-pressure mot HTTP-endpoints; outbox skiljer write-väg från
//     publish-väg.

import { Kafka, type Producer } from 'kafkajs';
import type { Logger } from 'pino';
import type { MappingAssistantDb, OutboxRow } from './db.js';

export interface AuditPublisherConfig {
  brokers: string[];
  clientId: string;
  topic: string;
  drainIntervalMs: number;
  batchSize: number;
}

export class AuditPublisher {
  private readonly kafka: Kafka;
  private readonly producer: Producer;
  private connected = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  public publishedTotal = 0;
  public failedTotal = 0;
  public lastPublishAt: string | null = null;
  public lastError: string | null = null;

  constructor(
    private readonly cfg: AuditPublisherConfig,
    private readonly db: MappingAssistantDb,
    private readonly logger: Logger,
  ) {
    this.kafka = new Kafka({
      clientId: cfg.clientId,
      brokers: cfg.brokers,
      retry: { retries: 5, initialRetryTime: 300 },
    });
    this.producer = this.kafka.producer({ idempotent: true, maxInFlightRequests: 5 });
  }

  async start(): Promise<void> {
    // Bästa-möjliga connect; failure håller bara connected=false. Drain-loopen
    // försöker reconnecta på nästa tick.
    await this.tryConnect();
    this.timer = setInterval(() => void this.drain(), this.cfg.drainIntervalMs);
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.connected) {
      await this.producer.disconnect().catch(() => undefined);
      this.connected = false;
    }
  }

  private async tryConnect(): Promise<boolean> {
    if (this.connected) return true;
    try {
      await this.producer.connect();
      this.connected = true;
      this.logger.info({ brokers: this.cfg.brokers, topic: this.cfg.topic }, 'audit-publisher connected');
      return true;
    } catch (err) {
      this.lastError = String(err);
      this.logger.warn({ err: String(err) }, 'audit-publisher connect failed (will retry)');
      return false;
    }
  }

  async drain(): Promise<{ drained: number; pending: number }> {
    const pending = this.db.pendingAudit(this.cfg.batchSize);
    if (pending.length === 0) {
      return { drained: 0, pending: 0 };
    }
    if (!(await this.tryConnect())) {
      return { drained: 0, pending: pending.length };
    }
    const successIds: number[] = [];
    for (const row of pending) {
      try {
        await this.producer.send({
          topic: this.cfg.topic,
          messages: [
            {
              key: row.event_id,
              value: row.payload,
              headers: {
                'content-type': 'application/json',
                'event-id': row.event_id,
                'event-type': row.event_type,
              },
            },
          ],
        });
        successIds.push(row.id);
      } catch (err) {
        this.failedTotal++;
        this.db.markAuditFailed(row.id, String(err));
        this.logger.warn({ err: String(err), id: row.id }, 'audit publish failed');
        // Connection-fel: bryt batchen, försök reconnect på nästa tick
        this.connected = false;
        break;
      }
    }
    if (successIds.length > 0) {
      this.db.markAuditPublished(successIds);
      this.publishedTotal += successIds.length;
      this.lastPublishAt = new Date().toISOString();
      this.logger.info({ published: successIds.length }, 'audit batch drained');
    }
    return { drained: successIds.length, pending: this.db.outboxStats().pending };
  }

  /** Status-snapshot för observability. */
  status() {
    return {
      connected: this.connected,
      publishedTotal: this.publishedTotal,
      failedTotal: this.failedTotal,
      lastPublishAt: this.lastPublishAt,
      lastError: this.lastError,
      outbox: this.db.outboxStats(),
    };
  }

  /** Kafka-bekvämligt: en testbar publish-helper när brokers saknas. */
  isConnected(): boolean {
    return this.connected;
  }

  /** Hur många events är i outbox. */
  pending(): OutboxRow[] {
    return this.db.pendingAudit(1000);
  }
}
