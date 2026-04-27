// SQLite-store för mapping-assistant. Två tabeller:
//   - suggestions: AI-genererade förslag (pending → approved/rejected)
//   - audit_outbox: events att publicera till core.audit.mapping
//
// Synkron better-sqlite3 — låg samtidighet (1 admin/CLI-användare i taget).

import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Logger } from 'pino';

export interface SuggestionRow {
  id: string;
  task: string;
  status: 'pending' | 'approved' | 'rejected';
  source: string | null;
  target: string | null;
  prompt_hash: string;
  template_name: string;
  template_sha: string;
  provider_id: string;
  model_used: string;
  data_residency: string;
  input_tokens: number | null;
  output_tokens: number | null;
  latency_ms: number | null;
  generated_text: string;
  review_notes: string | null;
  proposed_path: string | null;
  approver_hsa_id: string | null;
  approver_role: string | null;
  decision_at: string | null;
  decision_reason: string | null;
  created_at: string;
}

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

export interface NewSuggestion {
  id?: string;
  task: string;
  source: string | null;
  target: string | null;
  prompt_hash: string;
  template_name: string;
  template_sha: string;
  provider_id: string;
  model_used: string;
  data_residency: string;
  input_tokens: number | null;
  output_tokens: number | null;
  latency_ms: number | null;
  generated_text: string;
  review_notes: string | null;
  proposed_path: string | null;
}

export class MappingAssistantDb {
  readonly db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
  }

  migrate(migrationsPath: string, logger: Logger): void {
    const resolved = path.isAbsolute(migrationsPath)
      ? migrationsPath
      : path.resolve(process.cwd(), migrationsPath);
    const files = readdirSync(resolved)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    for (const file of files) {
      const sql = readFileSync(path.join(resolved, file), 'utf-8');
      this.db.exec(sql);
      logger.info({ file }, 'migration applied');
    }
  }

  // ============================================================
  // Suggestions
  // ============================================================
  insertSuggestion(input: NewSuggestion): SuggestionRow {
    const id = input.id ?? randomUUID();
    this.db
      .prepare(
        `INSERT INTO suggestions
         (id, task, status, source, target, prompt_hash, template_name, template_sha,
          provider_id, model_used, data_residency, input_tokens, output_tokens, latency_ms,
          generated_text, review_notes, proposed_path)
         VALUES
         (@id, @task, 'pending', @source, @target, @prompt_hash, @template_name, @template_sha,
          @provider_id, @model_used, @data_residency, @input_tokens, @output_tokens, @latency_ms,
          @generated_text, @review_notes, @proposed_path)`,
      )
      .run({ id, ...input });
    return this.findSuggestion(id)!;
  }

  findSuggestion(id: string): SuggestionRow | null {
    const r = this.db
      .prepare<unknown[], SuggestionRow>('SELECT * FROM suggestions WHERE id = ?')
      .get(id);
    return r ?? null;
  }

  listSuggestions(filter: { status?: string; limit?: number } = {}): SuggestionRow[] {
    const limit = filter.limit ?? 100;
    if (filter.status) {
      return this.db
        .prepare<unknown[], SuggestionRow>(
          'SELECT * FROM suggestions WHERE status = ? ORDER BY created_at DESC LIMIT ?',
        )
        .all(filter.status, limit);
    }
    return this.db
      .prepare<unknown[], SuggestionRow>(
        'SELECT * FROM suggestions ORDER BY created_at DESC LIMIT ?',
      )
      .all(limit);
  }

  updateSuggestionStatus(args: {
    id: string;
    status: 'approved' | 'rejected';
    approver_hsa_id: string;
    approver_role: string;
    decision_reason: string | null;
  }): SuggestionRow | null {
    this.db
      .prepare(
        `UPDATE suggestions
            SET status = @status,
                approver_hsa_id = @approver_hsa_id,
                approver_role = @approver_role,
                decision_at = CURRENT_TIMESTAMP,
                decision_reason = @decision_reason
          WHERE id = @id AND status = 'pending'`,
      )
      .run(args);
    return this.findSuggestion(args.id);
  }

  // ============================================================
  // Audit outbox
  // ============================================================
  enqueueAudit(args: { event_type: string; payload: object; event_id?: string }): OutboxRow {
    const event_id = args.event_id ?? randomUUID();
    const payload = JSON.stringify(args.payload);
    this.db
      .prepare(
        `INSERT INTO audit_outbox (event_id, event_type, payload) VALUES (?, ?, ?)`,
      )
      .run(event_id, args.event_type, payload);
    return this.db
      .prepare<unknown[], OutboxRow>('SELECT * FROM audit_outbox WHERE event_id = ?')
      .get(event_id)!;
  }

  pendingAudit(limit: number): OutboxRow[] {
    return this.db
      .prepare<unknown[], OutboxRow>(
        'SELECT * FROM audit_outbox WHERE published_at IS NULL ORDER BY id ASC LIMIT ?',
      )
      .all(limit);
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
        `UPDATE audit_outbox
            SET publish_attempts = publish_attempts + 1,
                last_attempt_at = CURRENT_TIMESTAMP,
                last_error = ?
          WHERE id = ?`,
      )
      .run(error, id);
  }

  outboxStats(): { pending: number; published: number } {
    const p = this.db.prepare('SELECT COUNT(*) AS n FROM audit_outbox WHERE published_at IS NULL').get() as { n: number };
    const s = this.db.prepare('SELECT COUNT(*) AS n FROM audit_outbox WHERE published_at IS NOT NULL').get() as { n: number };
    return { pending: p.n, published: s.n };
  }

  // ============================================================
  // Template-verifieringslogg
  // ============================================================
  recordTemplateVerification(args: {
    manifest_sha: string;
    total_templates: number;
    passed: number;
    failed: number;
    failure_details: string | null;
  }): void {
    this.db
      .prepare(
        `INSERT INTO template_verifications (manifest_sha, total_templates, passed, failed, failure_details)
         VALUES (@manifest_sha, @total_templates, @passed, @failed, @failure_details)`,
      )
      .run(args);
  }

  countSuggestions(): { pending: number; approved: number; rejected: number } {
    const row = this.db
      .prepare(
        `SELECT
            SUM(status='pending') AS pending,
            SUM(status='approved') AS approved,
            SUM(status='rejected') AS rejected
           FROM suggestions`,
      )
      .get() as { pending: number; approved: number; rejected: number } | undefined;
    return {
      pending: Number(row?.pending ?? 0),
      approved: Number(row?.approved ?? 0),
      rejected: Number(row?.rejected ?? 0),
    };
  }

  close(): void {
    this.db.close();
  }
}
