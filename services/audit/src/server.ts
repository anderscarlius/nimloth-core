// Audit REST API.
// Plan-acceptans: GET /audit/search?personnummer=... returnerar audit-poster.
// Prompt 9 specificerar /api/audit/* — vi exponerar BÅDA prefixen för bakåtkompatibilitet.

import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import type pg from 'pg';
import type { Logger } from 'pino';
import type { AuditStore } from './store.js';
import type { AuditConsumer } from './consumer.js';

export interface AuditServerDeps {
  pool: pg.Pool;
  store: AuditStore;
  consumer: AuditConsumer;
  logger: Logger;
  enforceAdmin: boolean;
}

/** Enkel admin-kontroll via X-User-Role: admin (eller ADMIN). */
function adminGuard(enforce: boolean) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!enforce) return next();
    const role = (req.header('x-user-role') ?? '').toUpperCase();
    if (role !== 'ADMIN') {
      res.status(403).json({ error: 'forbidden', message: 'admin role required' });
      return;
    }
    next();
  };
}

function toDateArg(v: unknown): string | null {
  if (typeof v !== 'string' || v.length === 0) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function createServer(deps: AuditServerDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'audit',
      consumer: { received: deps.consumer.received, errors: deps.consumer.errors },
      store: { ...deps.store.metrics },
    });
  });

  app.get('/metrics', (_req, res) => {
    const m = deps.store.metrics;
    const lines = [
      `# HELP core_audit_received_total Antal mottagna audit-events`,
      `# TYPE core_audit_received_total counter`,
      `core_audit_received_total ${deps.consumer.received}`,
      `# HELP core_audit_inserted_total Antal insert:ade audit-rader`,
      `# TYPE core_audit_inserted_total counter`,
      `core_audit_inserted_total ${m.totalInserted}`,
      `# HELP core_audit_dropped_total Antal droppade (duplicates + errors)`,
      `# TYPE core_audit_dropped_total counter`,
      `core_audit_dropped_total ${m.totalDropped}`,
      `# HELP core_audit_batches_total Antal batcher flushade`,
      `# TYPE core_audit_batches_total counter`,
      `core_audit_batches_total ${m.batchesFlushed}`,
    ];
    res.type('text/plain; version=0.0.4').send(lines.join('\n') + '\n');
  });

  const api = express.Router();
  api.use(adminGuard(deps.enforceAdmin));

  // GET /audit/search?patient=... | ?actor=... | ?personnummer=... & from & to
  api.get('/search', async (req, res, next) => {
    try {
      const patient = (typeof req.query.patient === 'string' ? req.query.patient : undefined)
        ?? (typeof req.query.personnummer === 'string' ? req.query.personnummer : undefined);
      const actor = typeof req.query.actor === 'string' ? req.query.actor : undefined;
      const from = toDateArg(req.query.from);
      const to = toDateArg(req.query.to);
      const limit = Math.min(Number(req.query.limit ?? 200), 1000);

      const clauses: string[] = [];
      const vals: unknown[] = [];
      let p = 1;
      if (patient) { clauses.push(`patient_personnummer = $${p++}`); vals.push(patient); }
      if (actor) { clauses.push(`actor_hsa_id = $${p++}`); vals.push(actor); }
      if (from) { clauses.push(`timestamp >= $${p++}`); vals.push(from); }
      if (to) { clauses.push(`timestamp <= $${p++}`); vals.push(to); }
      vals.push(limit);

      const sql = `SELECT audit_id, event_id, timestamp, actor_hsa_id, actor_name, actor_role,
                          action, resource_type, resource_id, patient_personnummer,
                          care_unit, purpose, legal_basis, outcome, source_ip, user_agent,
                          request_id, details, created_at
                   FROM audit_log
                   ${clauses.length > 0 ? 'WHERE ' + clauses.join(' AND ') : ''}
                   ORDER BY timestamp DESC
                   LIMIT $${p}`;
      const r = await deps.pool.query(sql, vals);
      res.json({ total: r.rowCount, results: r.rows });
    } catch (err) {
      next(err);
    }
  });

  // GET /audit/stats — aggregerad statistik
  api.get('/stats', async (_req, res, next) => {
    try {
      const [byDay, byResource, byOutcome] = await Promise.all([
        deps.pool.query(
          `SELECT DATE_TRUNC('day', timestamp) AS day, COUNT(*)::int AS count
           FROM audit_log
           WHERE timestamp >= NOW() - INTERVAL '30 days'
           GROUP BY 1 ORDER BY 1 DESC`,
        ),
        deps.pool.query(
          `SELECT resource_type, COUNT(*)::int AS count
           FROM audit_log GROUP BY resource_type ORDER BY count DESC`,
        ),
        deps.pool.query(
          `SELECT outcome, COUNT(*)::int AS count
           FROM audit_log GROUP BY outcome ORDER BY count DESC`,
        ),
      ]);
      res.json({
        by_day: byDay.rows,
        by_resource_type: byResource.rows,
        by_outcome: byOutcome.rows,
      });
    } catch (err) {
      next(err);
    }
  });

  // GET /audit/emergency-access — nödöppningar (för manuell granskning)
  api.get('/emergency-access', async (_req, res, next) => {
    try {
      const r = await deps.pool.query(
        `SELECT audit_id, timestamp, actor_hsa_id, actor_name, patient_personnummer,
                care_unit, purpose, legal_basis, resource_type, resource_id, details
         FROM audit_log
         WHERE outcome = 'EMERGENCY_ACCESS'
         ORDER BY timestamp DESC LIMIT 500`,
      );
      res.json({ total: r.rowCount, results: r.rows });
    } catch (err) {
      next(err);
    }
  });

  // Monterar på BÅDA /audit och /api/audit för kompatibilitet med plan + prompt.
  app.use('/audit', api);
  app.use('/api/audit', api);

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    deps.logger.error({ err }, 'audit request failed');
    const msg = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: 'internal', message: msg });
  });

  return app;
}
