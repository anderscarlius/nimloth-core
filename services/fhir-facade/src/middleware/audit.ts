// Audit-middleware — publicerar AuditEvent till core.audit.access vid varje anrop.

import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import type { Logger } from 'pino';
import type { Producer } from 'kafkajs';

interface AuditDeps {
  producer: Producer;
  logger: Logger;
  topic?: string;
}

function resourceTypeFromPath(originalUrl: string): string | undefined {
  const m = originalUrl.match(/^\/fhir\/r4\/([A-Za-z]+)/);
  return m ? m[1] : undefined;
}

function actionFromMethod(method: string, originalUrl: string): string {
  const urlPath = originalUrl.split('?')[0];
  if (urlPath.endsWith('/$everything') || urlPath.endsWith('/%24everything')) return 'READ';
  if (method === 'GET') {
    return /\/fhir\/r4\/[^/]+\/[^/]+$/.test(urlPath) ? 'READ' : 'SEARCH';
  }
  if (method === 'POST') return 'CREATE';
  if (method === 'PUT' || method === 'PATCH') return 'UPDATE';
  if (method === 'DELETE') return 'DELETE';
  return method;
}

export function auditMiddleware(deps: AuditDeps) {
  const topic = deps.topic ?? 'core.audit.access';
  return (req: Request, res: Response, next: NextFunction): void => {
    // Middleware är monterad på FHIR-routern, så alla requests som når hit
    // är redan FHIR-anrop. Kolla mot originalUrl för säker filterering.
    if (!req.originalUrl.startsWith('/fhir/')) return next();

    const start = Date.now();
    res.on('finish', () => {
      const outcome =
        res.statusCode === 403
          ? 'DENIED_NO_CARE_RELATION'
          : res.statusCode >= 400
            ? 'ERROR'
            : req.pdl?.emergency_access
              ? 'EMERGENCY_ACCESS'
              : 'SUCCESS';

      const event = {
        event_id: randomUUID(),
        timestamp: new Date().toISOString(),
        actor: {
          hsa_id: req.user?.hsa_id ?? 'anonymous',
          name: req.user?.name,
          role: req.user?.role,
        },
        action: actionFromMethod(req.method, req.originalUrl),
        resource_type: resourceTypeFromPath(req.originalUrl) ?? 'unknown',
        resource_id: (req.params as { id?: string }).id,
        patient_id:
          (typeof req.query.patient === 'string' ? req.query.patient : undefined) ??
          (typeof req.query.identifier === 'string' ? req.query.identifier : undefined) ??
          ((req.params as { id?: string }).id ?? ''),
        pdl_context: req.pdl
          ? {
              care_unit: req.pdl.care_unit,
              purpose: req.pdl.purpose,
              legal_basis: req.pdl.legal_basis,
            }
          : undefined,
        outcome,
        source_ip: req.ip,
        user_agent: req.header('user-agent'),
        request_id: req.header('x-request-id') ?? randomUUID(),
        duration_ms: Date.now() - start,
      };

      deps.producer
        .send({ topic, messages: [{ key: event.patient_id, value: JSON.stringify(event) }] })
        .catch((err) => deps.logger.warn({ err }, 'Failed to publish audit event'));
    });

    next();
  };
}
