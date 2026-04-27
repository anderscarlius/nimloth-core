// HTTP-server för mapping-assistant. Endpoints i Fas 4.1:
//   GET  /health                    — liveness
//   GET  /system-status              — observerbarhet (router-providers + outbox)
//   POST /propose                    — skapa nytt förslag
//   GET  /suggestions                — lista förslag (?status=pending)
//   GET  /suggestions/:id            — hämta enskilt förslag
//   POST /suggestions/:id/approve    — godkänn
//   POST /suggestions/:id/reject     — avvisa
//
// Fas 4.2 lägger till /observe (Kafka-konsument internt) och /ask.
// Fas 4.3 wirar in dashboard-konsument.

import express, { type Request, type Response } from 'express';
import type { Logger } from 'pino';
import type { ModelRouter } from '@nimloth-core/model-router';
import type { MappingAssistantDb } from './db.js';
import type { AuditPublisher } from './audit-publisher.js';
import type { Proposer, ProposeRequest } from './proposer.js';
import type { VerificationResult } from './prompt-store.js';

export interface ServerDeps {
  db: MappingAssistantDb;
  router: ModelRouter;
  proposer: Proposer;
  publisher: AuditPublisher;
  promptVerification: VerificationResult;
  logger: Logger;
  loadedAt: string;
}

export function createApp(deps: ServerDeps): express.Express {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'mapping-assistant',
      promptsVerified: deps.promptVerification.failed === 0,
    });
  });

  app.get('/system-status', (_req, res) => {
    const counts = deps.db.countSuggestions();
    res.json({
      status: 'ok',
      service: 'mapping-assistant',
      loadedAt: deps.loadedAt,
      prompts: {
        manifestSha: deps.promptVerification.manifestSha,
        passed: deps.promptVerification.passed,
        failed: deps.promptVerification.failed,
        templates: Array.from(deps.promptVerification.templates.values()).map((t) => ({
          name: t.entry.name,
          file: t.entry.file,
          sha256: t.entry.sha256,
          task: t.entry.task,
          sensitivity: t.entry.sensitivity,
        })),
      },
      router: {
        providers: deps.router.listProviders().map((p) => ({
          id: p.id,
          type: p.type,
          enabled: p.enabled,
          dataResidency: p.dataResidency,
          models: p.models,
        })),
        rules: deps.router.listRules().map((r) => ({
          task: r.task,
          sensitivity: r.sensitivity,
          require: r.require,
          prefer: r.prefer,
          fallback: r.fallback,
        })),
      },
      audit: deps.publisher.status(),
      suggestions: counts,
    });
  });

  // ----------------------------------------------------------------
  // Propose
  // ----------------------------------------------------------------
  app.post('/propose', async (req: Request, res: Response) => {
    const body = req.body as Partial<ProposeRequest> | undefined;
    if (!body || typeof body.source !== 'string' || typeof body.target !== 'string') {
      res.status(400).json({ error: 'expected { source, target, schema, samples?, existingMappers? }' });
      return;
    }
    if (!Array.isArray(body.schema)) {
      res.status(400).json({ error: 'schema must be array of {column, type}' });
      return;
    }
    try {
      const suggestion = await deps.proposer.propose(body as ProposeRequest);
      res.status(201).json(suggestion);
    } catch (err) {
      deps.logger.error({ err: String(err), body }, 'propose failed');
      res.status(500).json({ error: 'propose failed', detail: String(err) });
    }
  });

  // ----------------------------------------------------------------
  // List + read suggestions
  // ----------------------------------------------------------------
  app.get('/suggestions', (req: Request, res: Response) => {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 100;
    const rows = deps.db.listSuggestions({ status, limit: Number.isFinite(limit) ? limit : 100 });
    res.json({ count: rows.length, suggestions: rows });
  });

  app.get('/suggestions/:id', (req: Request, res: Response) => {
    const row = deps.db.findSuggestion(req.params.id);
    if (!row) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    res.json(row);
  });

  // ----------------------------------------------------------------
  // Approve / Reject
  //
  // Båda kräver approver-identitet i body. I Sprint 3 ersätts detta av
  // SITHS-cert/Sambi-OIDC-headers; just nu räcker explicit body för CLI/dashboard.
  // ----------------------------------------------------------------
  app.post('/suggestions/:id/approve', (req: Request, res: Response) => {
    handleDecision(req, res, 'approved', deps);
  });

  app.post('/suggestions/:id/reject', (req: Request, res: Response) => {
    handleDecision(req, res, 'rejected', deps);
  });

  return app;
}

function handleDecision(
  req: Request,
  res: Response,
  status: 'approved' | 'rejected',
  deps: ServerDeps,
): void {
  const body = req.body as { approver_hsa_id?: string; approver_role?: string; reason?: string } | undefined;
  if (!body?.approver_hsa_id || !body?.approver_role) {
    res.status(400).json({ error: 'expected { approver_hsa_id, approver_role, reason? }' });
    return;
  }
  const updated = deps.db.updateSuggestionStatus({
    id: req.params.id,
    status,
    approver_hsa_id: body.approver_hsa_id,
    approver_role: body.approver_role,
    decision_reason: body.reason ?? null,
  });
  if (!updated) {
    res.status(404).json({ error: 'not found or already decided' });
    return;
  }
  // Skriv audit-event för beslutet.
  deps.db.enqueueAudit({
    event_type: status === 'approved' ? 'suggestion_approved' : 'suggestion_rejected',
    payload: {
      suggestion_id: updated.id,
      task: updated.task,
      provider_id: updated.provider_id,
      model_used: updated.model_used,
      template_name: updated.template_name,
      template_sha: updated.template_sha,
      prompt_hash: updated.prompt_hash,
      approver: { hsaId: body.approver_hsa_id, role: body.approver_role },
      reason: body.reason ?? null,
      timestamp: new Date().toISOString(),
    },
  });
  res.json(updated);
}
