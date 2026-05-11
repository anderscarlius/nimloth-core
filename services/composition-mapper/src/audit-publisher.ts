// Audit-publisher för composition-mapper. Drainar audit_outbox →
// core.audit.access (Kafka).
//
// Avviker från mapping-assistant: lazy-connect så att service kan boota
// utan Kafka tillgängligt (P4 4.1-beslut, Anders 2026-05-07).
// Kafka-producer instantieras vid första publish()/drain()-anrop då outbox
// har minst en pending rad. Boot-tid är därmed Kafka-oberoende.
//
// B25 4.10.5 — disabled-mode: när KAFKA_BROKERS=disabled (eller tomt) skip:as
// drain-loopen helt. Events skrivs fortfarande till SQLite-outbox av
// emitMappingAudit, men aldrig publicerade till Kafka. Avsedd för demo-
// instans utan Kafka i nätverket. Logspam undviks.

import { Kafka, type Producer } from 'kafkajs';
import type { Logger } from 'pino';
import type { CompositionMapperDb, OutboxRow } from './db.js';

export interface AuditPublisherConfig {
  brokers: string[];
  clientId: string;
  topic: string;
  drainIntervalMs: number;
  batchSize: number;
}

/**
 * Heuristik för "disabled" — tre former:
 *  - Tom array (KAFKA_BROKERS saknas helt + ingen default)
 *  - Första broker är 'disabled' (explicit opt-out)
 *  - Första broker är tom sträng (KAFKA_BROKERS= i .env)
 */
export function isKafkaDisabled(brokers: string[]): boolean {
  if (brokers.length === 0) return true;
  const first = (brokers[0] ?? '').trim().toLowerCase();
  return first === '' || first === 'disabled';
}

export class AuditPublisher {
  private kafka: Kafka | null = null;
  private producer: Producer | null = null;
  private connected = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly disabled: boolean;

  public publishedTotal = 0;
  public failedTotal = 0;
  public lastPublishAt: string | null = null;
  public lastError: string | null = null;

  constructor(
    private readonly cfg: AuditPublisherConfig,
    private readonly db: CompositionMapperDb,
    private readonly logger: Logger,
  ) {
    this.disabled = isKafkaDisabled(cfg.brokers);
  }

  /**
   * Startar drain-loopen. Kafka-instans skapas INTE här — bara timer-tick
   * registreras. Producer instantieras vid behov i drain(). I disabled-
   * mode (B25 4.10.5) registreras ingen timer — events stannar i outbox.
   */
  start(): void {
    if (this.disabled) {
      this.logger.warn(
        { brokers: this.cfg.brokers },
        'audit-publisher DISABLED (KAFKA_BROKERS=disabled or empty). ' +
          'Events stannar i SQLite-outbox utan att publiceras till Kafka.',
      );
      return;
    }
    this.timer = setInterval(() => void this.drain(), this.cfg.drainIntervalMs);
    this.logger.info(
      { drainIntervalMs: this.cfg.drainIntervalMs, mode: 'lazy-connect' },
      'audit-publisher started',
    );
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.connected && this.producer) {
      await this.producer.disconnect().catch(() => undefined);
      this.connected = false;
    }
  }

  private ensureProducer(): void {
    if (this.kafka && this.producer) return;
    this.kafka = new Kafka({
      clientId: this.cfg.clientId,
      brokers: this.cfg.brokers,
      retry: { retries: 5, initialRetryTime: 300 },
    });
    this.producer = this.kafka.producer({ idempotent: true, maxInFlightRequests: 5 });
  }

  private async tryConnect(): Promise<boolean> {
    if (this.connected) return true;
    this.ensureProducer();
    try {
      await this.producer!.connect();
      this.connected = true;
      this.logger.info(
        { brokers: this.cfg.brokers, topic: this.cfg.topic },
        'audit-publisher connected',
      );
      return true;
    } catch (err) {
      this.lastError = String(err);
      this.logger.warn({ err: String(err) }, 'audit-publisher connect failed (will retry)');
      return false;
    }
  }

  async drain(): Promise<{ drained: number; pending: number }> {
    if (this.disabled) {
      // Disabled-mode (B25 4.10.5): outbox-rader stannar pending. Aldrig
      // försök till Kafka-anslutning. Återkalla pending-count för status-endpoint.
      return { drained: 0, pending: this.db.outboxStats().pending };
    }
    const pending = this.db.pendingAudit(this.cfg.batchSize);
    if (pending.length === 0) {
      // Lazy-connect: ingen anledning att skapa Kafka-klient om outbox är tom.
      return { drained: 0, pending: 0 };
    }
    if (!(await this.tryConnect())) {
      return { drained: 0, pending: pending.length };
    }
    const successIds: number[] = [];
    for (const row of pending) {
      try {
        await this.producer!.send({
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

  status(): {
    disabled: boolean;
    connected: boolean;
    publishedTotal: number;
    failedTotal: number;
    lastPublishAt: string | null;
    lastError: string | null;
    outbox: { pending: number; published: number; failed: number };
  } {
    return {
      disabled: this.disabled,
      connected: this.connected,
      publishedTotal: this.publishedTotal,
      failedTotal: this.failedTotal,
      lastPublishAt: this.lastPublishAt,
      lastError: this.lastError,
      outbox: this.db.outboxStats(),
    };
  }

  isConnected(): boolean {
    return this.connected;
  }

  isDisabled(): boolean {
    return this.disabled;
  }

  pending(): OutboxRow[] {
    return this.db.pendingAudit(1000);
  }
}
