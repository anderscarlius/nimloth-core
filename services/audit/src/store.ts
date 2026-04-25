// Bulk-insert av audit-events med batching.
// Flush vid maxSize ELLER maxLatencyMs, beroende på vilket inträffar först.
// ON CONFLICT (event_id) DO NOTHING gör insert idempotent.

import type { Logger } from 'pino';
import type pg from 'pg';
import type { AuditConfig } from './config.js';
import type { AuditEventMessage } from './types.js';

export interface StoreMetrics {
  totalInserted: number;
  totalDropped: number;
  batchesFlushed: number;
  lastFlushAt: string | null;
}

export class AuditStore {
  private buffer: AuditEventMessage[] = [];
  private timer: NodeJS.Timeout | null = null;
  public readonly metrics: StoreMetrics = {
    totalInserted: 0,
    totalDropped: 0,
    batchesFlushed: 0,
    lastFlushAt: null,
  };

  constructor(
    private readonly pool: pg.Pool,
    private readonly cfg: AuditConfig['batch'],
    private readonly logger: Logger,
  ) {}

  add(event: AuditEventMessage): void {
    this.buffer.push(event);
    if (this.buffer.length >= this.cfg.maxSize) {
      void this.flush('size');
    } else if (!this.timer) {
      this.timer = setTimeout(() => {
        void this.flush('time');
      }, this.cfg.maxLatencyMs);
    }
  }

  async flush(trigger: 'size' | 'time' | 'shutdown'): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const batch = this.buffer.splice(0);
    if (batch.length === 0) return;

    const columns = [
      'event_id', 'timestamp', 'actor_hsa_id', 'actor_name', 'actor_role',
      'action', 'resource_type', 'resource_id', 'patient_personnummer',
      'care_unit', 'purpose', 'legal_basis', 'outcome',
      'source_ip', 'user_agent', 'request_id', 'details',
    ];

    const placeholders: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    for (const e of batch) {
      placeholders.push(
        `($${i}, $${i + 1}, $${i + 2}, $${i + 3}, $${i + 4}, $${i + 5}, $${i + 6}, $${i + 7}, $${i + 8}, $${i + 9}, $${i + 10}, $${i + 11}, $${i + 12}, $${i + 13}, $${i + 14}, $${i + 15}, $${i + 16})`,
      );
      values.push(
        e.event_id,
        e.timestamp,
        e.actor?.hsa_id ?? null,
        e.actor?.name ?? null,
        e.actor?.role ?? null,
        e.action,
        e.resource_type,
        e.resource_id ?? null,
        e.patient_id ?? null,
        e.pdl_context?.care_unit ?? null,
        e.pdl_context?.purpose ?? null,
        e.pdl_context?.legal_basis ?? null,
        e.outcome,
        e.source_ip ?? null,
        e.user_agent ?? null,
        e.request_id ?? null,
        { duration_ms: e.duration_ms ?? null },
      );
      i += 17;
    }

    const sql = `INSERT INTO audit_log (${columns.join(', ')}) VALUES ${placeholders.join(', ')}
                 ON CONFLICT (event_id) DO NOTHING`;
    try {
      const r = await this.pool.query(sql, values);
      this.metrics.totalInserted += r.rowCount ?? 0;
      this.metrics.batchesFlushed++;
      this.metrics.lastFlushAt = new Date().toISOString();
      const dropped = batch.length - (r.rowCount ?? 0);
      this.metrics.totalDropped += dropped;
      this.logger.debug({ trigger, batch: batch.length, inserted: r.rowCount, dropped }, 'Audit batch flushed');
    } catch (err) {
      this.logger.error({ err, batchSize: batch.length }, 'Audit batch insert failed');
      // Drop batch — alternativ vore att skriva till dead-letter-topic.
      this.metrics.totalDropped += batch.length;
    }
  }
}
