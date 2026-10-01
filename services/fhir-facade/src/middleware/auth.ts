// Auth-middleware — dev-stub (AUTH_MODE=dev) eller Keycloak JWT (keycloak/siths).

import type { Request, Response, NextFunction } from 'express';
import type { AuthConfig } from '../auth/config.js';
import { loadAuthConfig } from '../auth/config.js';
import { verifyBearerJwt } from '../auth/jwt.js';
import { validateHsaId } from '../auth/hsa-client.js';

export interface AuthUser {
  hsa_id: string;
  name?: string;
  role?: string;
  organization?: string;
}

export interface AuthMiddlewareDeps {
  config: AuthConfig;
  verifyToken?: (token: string) => Promise<Record<string, unknown>>;
  validateHsa?: (hsaId: string) => Promise<boolean>;
}

function loginOutcome(res: Response, status: 401 | 403, diagnostics: string): void {
  res.status(status).type('application/fhir+json').json({
    resourceType: 'OperationOutcome',
    issue: [{ severity: 'error', code: status === 401 ? 'login' : 'forbidden', diagnostics }],
  });
}

function userFromJwtPayload(payload: Record<string, unknown>, config: AuthConfig, req: Request): AuthUser | null {
  const rawHsa = payload[config.hsaClaim] ?? payload['hsaId'];
  const hsaId =
    typeof rawHsa === 'string'
      ? rawHsa
      : Array.isArray(rawHsa) && typeof rawHsa[0] === 'string'
        ? rawHsa[0]
        : typeof payload.sub === 'string'
          ? payload.sub
          : '';
  if (!hsaId) return null;

  const name =
    typeof payload.name === 'string'
      ? payload.name
      : [payload.given_name, payload.family_name].filter((p) => typeof p === 'string').join(' ') || undefined;

  const roleHeader = req.header('x-user-role');
  const roleClaim = payload.role;
  const role =
    roleHeader ??
    (typeof roleClaim === 'string' ? roleClaim : Array.isArray(roleClaim) ? roleClaim[0] : undefined) ??
    'PHYSICIAN';

  return {
    hsa_id: hsaId,
    name,
    role: typeof role === 'string' ? role : 'PHYSICIAN',
    organization: typeof payload.organization === 'string' ? payload.organization : undefined,
  };
}

function applyDevAuth(req: Request): void {
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
}

export function createAuthMiddleware(deps: AuthMiddlewareDeps, opts: { required?: boolean } = {}) {
  const required = opts.required ?? false;
  const verify =
    deps.verifyToken ??
    ((token: string) => verifyBearerJwt(token, deps.config));
  const validateHsa =
    deps.validateHsa ??
    (deps.config.hsaServiceUrl
      ? (hsaId: string) => validateHsaId(deps.config.hsaServiceUrl!, hsaId)
      : undefined);

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (deps.config.mode === 'dev') {
      applyDevAuth(req);
      if (required && !req.user) {
        loginOutcome(res, 401, 'authentication required');
        return;
      }
      next();
      return;
    }

    // keycloak | siths — JWT krävs (mTLS/SITHS-CA hanteras vid gateway, ej här).
    const header = req.header('authorization');
    if (!header?.startsWith('Bearer ')) {
      loginOutcome(res, 401, 'Bearer JWT required (AUTH_MODE=' + deps.config.mode + ')');
      return;
    }

    try {
      const payload = await verify(header.slice(7));
      const user = userFromJwtPayload(payload, deps.config, req);
      if (!user) {
        loginOutcome(res, 401, 'JWT missing HSA identity claim');
        return;
      }

      if (validateHsa) {
        const ok = await validateHsa(user.hsa_id);
        if (!ok) {
          loginOutcome(res, 403, 'HSA-id not found in catalog');
          return;
        }
      }

      req.user = user;
      next();
    } catch {
      loginOutcome(res, 401, 'invalid or expired JWT');
    }
  };
}

/** Bakåtkompatibel wrapper — läser AUTH_MODE från env. */
export function authMiddleware(opts: { required?: boolean } = {}) {
  return createAuthMiddleware({ config: loadAuthConfig() }, opts);
}
