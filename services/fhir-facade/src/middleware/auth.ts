// Auth-middleware — dev-stub. Accepterar Bearer-token eller X-User-HSA header.
// Produktion skulle validera JWT mot Keycloak (Prompt 11+).

import type { Request, Response, NextFunction } from 'express';

export interface AuthUser {
  hsa_id: string;
  name?: string;
  role?: string;
  organization?: string;
}
// Module augmentation för Request.user finns i ../types.d.ts

export function authMiddleware(opts: { required?: boolean } = {}) {
  const required = opts.required ?? false;
  return (req: Request, res: Response, next: NextFunction): void => {
    const header = req.header('authorization');
    const hsaHeader = req.header('x-user-hsa');
    if (header?.startsWith('Bearer ')) {
      // Dev-mode: tolka Bearer-token som HSA-ID direkt.
      req.user = { hsa_id: header.slice(7), role: req.header('x-user-role') ?? 'PHYSICIAN' };
    } else if (hsaHeader) {
      req.user = { hsa_id: hsaHeader, role: req.header('x-user-role') ?? 'PHYSICIAN' };
    } else if (process.env.NODE_ENV !== 'production') {
      // Dev-default: anonym användare för att inte blockera demo.
      req.user = { hsa_id: 'SE-DEV-ANONYMOUS', role: 'PHYSICIAN' };
    }
    if (required && !req.user) {
      res.status(401).type('application/fhir+json').json({
        resourceType: 'OperationOutcome',
        issue: [{ severity: 'error', code: 'login', diagnostics: 'authentication required' }],
      });
      return;
    }
    next();
  };
}
