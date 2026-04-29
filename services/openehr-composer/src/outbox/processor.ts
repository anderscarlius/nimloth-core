// OutboxProcessor — pollar pending-rader, dispatchar till EHRbase, uppdaterar status.
//
// Multi-instance-säker via FOR UPDATE SKIP LOCKED (Postgres 9.5+, vi har 16).
//
// recoverFromCrash körs vid composer-startup: rader som hängde i status
// "processing" från en tidigare crashad instans återställs till pending så
// de plockas upp igen. Idempotency hanteras i EHRbase-klienten + via det
// faktum att composition-builder är deterministisk på samma event_id.

import type { Logger } from 'pino';
import type { Pool } from 'pg';
import type { OutboxRecord, OutboxRow } from './types.js';
import { rowToRecord } from './types.js';
import type { EhrbaseClient } from '../ehrbase-client.js';
import type { EhrCache } from '../ehr-cache.js';
import type { GapTracker } from '../gap-tracker.js';
import { mapEventToTemplate, isKnownGap } from '../event-mapper.js';
import { buildComposition } from '../composition-builder.js';

export interface ProcessorConfig {
  pollIntervalMs: number;
  batchSize: number;
  maxAttempts: number;
}

export interface ProcessorMetrics {
  processedTotal: number;
  failedTotal: number;
  skippedTotal: number;
  recoveredTotal: number;
  lastPollAt: string | null;
}

export class OutboxProcessor {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  public readonly metrics: ProcessorMetrics = {
    processedTotal: 0,
    failedTotal: 0,
    skippedTotal: 0,
    recoveredTotal: 0,
    lastPollAt: null,
  };

  constructor(
    private readonly pool: Pool,
    private readonly ehrCache: EhrCache,
    private readonly ehrbase: EhrbaseClient,
    private readonly gaps: GapTracker,
    private readonly cfg: ProcessorConfig,
    private readonly logger: Logger,
  ) {}

  /** Plocka tillbaka 'processing'-rader från crashad instans. */
  async recoverFromCrash(): Promise<number> {
    const r = await this.pool.query(
      `UPDATE composer_outbox
          SET status = 'pending'
        WHERE status = 'processing'
        RETURNING id`,
    );
    const n = r.rowCount ?? 0;
    this.metrics.recoveredTotal += n;
    if (n > 0) this.logger.info({ recovered: n }, 'recovered outbox rows from previous crash');
    return n;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.scheduleNext();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private scheduleNext(): void {
    if (!this.running) return;
    this.timer = setTimeout(() => {
      void this.pollOnce()
        .catch((err) => this.logger.error({ err: String(err) }, 'outbox poll error'))
        .finally(() => this.scheduleNext());
    }, this.cfg.pollIntervalMs);
  }

  /** En polling-cykel. Exporterad för tester (manuell trigger). */
  async pollOnce(): Promise<{ processed: number; failed: number; skipped: number }> {
    this.metrics.lastPollAt = new Date().toISOString();
    const claimed = await this.claimBatch(this.cfg.batchSize);
    let processed = 0;
    let failed = 0;
    let skipped = 0;
    for (const r of claimed) {
      try {
        const result = await this.processOne(r);
        if (result === 'completed') {
          processed++;
          this.metrics.processedTotal += 1;
        } else if (result === 'skipped') {
          skipped++;
          this.metrics.skippedTotal += 1;
        }
      } catch (err) {
        await this.markFailed(r, err);
        failed++;
        this.metrics.failedTotal += 1;
      }
    }
    return { processed, failed, skipped };
  }

  private async claimBatch(size: number): Promise<OutboxRecord[]> {
    const r = await this.pool.query<OutboxRow>(
      `UPDATE composer_outbox
          SET status = 'processing',
              attempts = attempts + 1
        WHERE id IN (
          SELECT id FROM composer_outbox
            WHERE status = 'pending'
              AND attempts < $1
            ORDER BY created_at
            LIMIT $2
            FOR UPDATE SKIP LOCKED
        )
        RETURNING *`,
      [this.cfg.maxAttempts, size],
    );
    return r.rows.map(rowToRecord);
  }

  private async processOne(record: OutboxRecord): Promise<'completed' | 'skipped'> {
    const event = record.payload;

    const mapping = mapEventToTemplate(event);
    if (!mapping) {
      const reason = isKnownGap(event.event_type)
        ? 'event-type är känt gap (EVALUATION-templates kommer i P3.0b)'
        : 'okänd event-type — mapping saknas';
      this.gaps.log('no_template_mapping', event.event_type, reason);
      await this.markSkipped(record, reason);
      return 'skipped';
    }

    const ehrId = await this.ehrCache.getOrCreate(event.patient_pnr);
    const composition = buildComposition(event, mapping, this.gaps);
    const uid = await this.ehrbase.postComposition(ehrId, mapping.templateId, composition);

    await this.markCompleted(record, uid, ehrId);
    return 'completed';
  }

  private async markCompleted(record: OutboxRecord, uid: string | null, ehrId: string): Promise<void> {
    await this.pool.query(
      `UPDATE composer_outbox
          SET status = 'completed',
              composition_uid = $2,
              ehr_id = $3,
              processed_at = now()
        WHERE id = $1`,
      [record.id, uid, ehrId],
    );
  }

  private async markFailed(record: OutboxRecord, err: unknown): Promise<void> {
    const message = err instanceof Error ? err.message : String(err);
    const willRetry = record.attempts < this.cfg.maxAttempts;
    await this.pool.query(
      `UPDATE composer_outbox
          SET status = $2,
              last_error = $3
        WHERE id = $1`,
      [record.id, willRetry ? 'pending' : 'failed', message.slice(0, 1000)],
    );
    this.logger.warn(
      { event_id: record.eventId, attempts: record.attempts, willRetry, err: message },
      'outbox row failed',
    );
  }

  private async markSkipped(record: OutboxRecord, reason: string): Promise<void> {
    await this.pool.query(
      `UPDATE composer_outbox
          SET status = 'skipped',
              last_error = $2,
              processed_at = now()
        WHERE id = $1`,
      [record.id, reason.slice(0, 1000)],
    );
  }

  /** Snapshot för stats-endpoint. */
  async stats(): Promise<{
    by_status: Array<{ status: string; count: number; max_attempts: number }>;
    oldest_pending: string | null;
    last_hour: { failed: number; completed: number };
    metrics: ProcessorMetrics;
  }> {
    const byStatus = await this.pool.query<{ status: string; count: string; max_attempts: number }>(
      `SELECT status, COUNT(*)::text AS count, COALESCE(MAX(attempts), 0) AS max_attempts
         FROM composer_outbox GROUP BY status`,
    );
    const oldest = await this.pool.query<{ oldest: Date | null }>(
      `SELECT MIN(created_at) AS oldest FROM composer_outbox WHERE status = 'pending'`,
    );
    const lastHour = await this.pool.query<{ failed: string; completed: string }>(
      `SELECT
          COUNT(*) FILTER (WHERE status = 'failed')::text AS failed,
          COUNT(*) FILTER (WHERE status = 'completed')::text AS completed
         FROM composer_outbox
         WHERE created_at > now() - INTERVAL '1 hour'`,
    );
    return {
      by_status: byStatus.rows.map((r) => ({
        status: r.status,
        count: Number(r.count),
        max_attempts: r.max_attempts,
      })),
      oldest_pending: oldest.rows[0]?.oldest?.toISOString() ?? null,
      last_hour: {
        failed: Number(lastHour.rows[0]?.failed ?? 0),
        completed: Number(lastHour.rows[0]?.completed ?? 0),
      },
      metrics: this.metrics,
    };
  }
}
