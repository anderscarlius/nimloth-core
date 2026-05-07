// SQLite-store för composition-mapper. Scaffold-läge — bara audit-outbox.
// Pattern-källa: services/mapping-assistant/src/db.ts (förenklat — inga
// suggestions/template_verifications-tabeller här).

import Database, { type Database as DB } from 'better-sqlite3';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Logger } from 'pino';

export interface OutboxRow {
  id: number;
  event_id: string;
  event_type: string;
  payload: string;
  created_at: string;
  publish_attempts: number;
  last_attempt_at: string | null;
  published_at: string | null;
  last_error: string | null;
}

export interface EnqueueAuditInput {
  event_id: string;
  event_type: string;
  payload: unknown;
}

export class CompositionMapperDb {
  private readonly db: DB;

  constructor(path: string) {
    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
  }

  migrate(migrationsPath: string, logger: Logger): void {
    const files = readdirSync(migrationsPath)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    for (const file of files) {
      const sql = readFileSync(join(migrationsPath, file), 'utf-8');
      this.db.exec(sql);
      logger.info({ file }, 'migration applied');
    }
  }

  enqueueAudit(input: EnqueueAuditInput): void {
    const stmt = this.db.prepare(
      `INSERT INTO audit_outbox (event_id, event_type, payload) VALUES (?, ?, ?)`,
    );
    stmt.run(input.event_id, input.event_type, JSON.stringify(input.payload));
  }

  pendingAudit(limit: number): OutboxRow[] {
    return this.db
      .prepare(
        `SELECT * FROM audit_outbox WHERE published_at IS NULL ORDER BY id ASC LIMIT ?`,
      )
      .all(limit) as OutboxRow[];
  }

  markAuditPublished(ids: number[]): void {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(',');
    this.db
      .prepare(
        `UPDATE audit_outbox SET published_at = CURRENT_TIMESTAMP WHERE id IN (${placeholders})`,
      )
      .run(...ids);
  }

  markAuditFailed(id: number, error: string): void {
    this.db
      .prepare(
        `UPDATE audit_outbox SET publish_attempts = publish_attempts + 1, last_attempt_at = CURRENT_TIMESTAMP, last_error = ? WHERE id = ?`,
      )
      .run(error, id);
  }

  outboxStats(): { pending: number; published: number; failed: number } {
    const pending = this.db
      .prepare(`SELECT count(*) as n FROM audit_outbox WHERE published_at IS NULL`)
      .get() as { n: number };
    const published = this.db
      .prepare(`SELECT count(*) as n FROM audit_outbox WHERE published_at IS NOT NULL`)
      .get() as { n: number };
    const failed = this.db
      .prepare(`SELECT count(*) as n FROM audit_outbox WHERE last_error IS NOT NULL AND published_at IS NULL`)
      .get() as { n: number };
    return { pending: pending.n, published: published.n, failed: failed.n };
  }

  close(): void {
    this.db.close();
  }
}
