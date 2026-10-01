// SMART on FHIR dev-stub routes — launch / authorize / token / context.

import express, { Router, type Request } from 'express';
import type { SmartConfig } from './config.js';
import { smartSessionStore } from './session-store.js';

function smartConfiguration(config: SmartConfig): Record<string, unknown> {
  const base = config.publicBaseUrl;
  return {
    authorization_endpoint: `${base}/smart/authorize`,
    token_endpoint: `${base}/smart/token`,
    capabilities: [
      'launch-ehr',
      'launch-standalone',
      'client-public',
      'context-ehr-patient',
      'permission-patient',
      'permission-user',
    ],
    scopes_supported: ['launch', 'openid', 'fhirUser', 'patient/*.read', 'user/*.read'],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256', 'plain'],
  };
}

function parseBearer(req: Request): string | null {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7);
}

export function createSmartRouter(config: SmartConfig): Router {
  const router = Router();
  router.use(express.json());
  router.use(express.urlencoded({ extended: false }));

  router.get('/.well-known/smart-configuration', (_req, res) => {
    res.type('application/json').json(smartConfiguration(config));
  });

  /**
   * Dev-only: skapa launch-kontext utan extern EHR (ersätter inte prod SMART).
   * Body: { patient, practitioner? }
   */
  router.post('/smart/dev/launch', (req, res) => {
    const body = req.body as { patient?: unknown; practitioner?: unknown };
    const patient = typeof body.patient === 'string' ? body.patient.trim() : '';
    if (!patient) {
      return res.status(400).json({ error: 'patient_required' });
    }
    const practitioner =
      typeof body.practitioner === 'string' && body.practitioner.trim()
        ? body.practitioner.trim()
        : 'Practitioner/SE-DEV-PHYSICIAN';
    const launch = smartSessionStore.createLaunch(patient, practitioner);
    return res.json({
      launch: launch.launchId,
      patient: launch.patient,
      practitioner: launch.practitioner,
      authorize_url: `${config.publicBaseUrl}/smart/authorize`,
      token_url: `${config.publicBaseUrl}/smart/token`,
    });
  });

  router.get('/smart/authorize', (req, res) => {
    const responseType = typeof req.query.response_type === 'string' ? req.query.response_type : '';
    const clientId = typeof req.query.client_id === 'string' ? req.query.client_id : '';
    const redirectUri = typeof req.query.redirect_uri === 'string' ? req.query.redirect_uri : '';
    const launchId = typeof req.query.launch === 'string' ? req.query.launch : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';

    if (responseType !== 'code' || !clientId || !redirectUri || !launchId) {
      return res.status(400).type('text/plain').send('invalid authorize request');
    }

    const codeRecord = smartSessionStore.issueAuthCode(launchId, clientId, redirectUri);
    if (!codeRecord) {
      return res.status(400).type('text/plain').send('unknown or expired launch');
    }

    const url = new URL(redirectUri);
    url.searchParams.set('code', codeRecord.code);
    if (state) url.searchParams.set('state', state);
    return res.redirect(302, url.toString());
  });

  router.post('/smart/token', (req, res) => {
    const grantType = pickField(req, 'grant_type');
    if (grantType !== 'authorization_code') {
      return res.status(400).json({ error: 'unsupported_grant_type' });
    }
    const code = pickField(req, 'code');
    const clientId = pickField(req, 'client_id');
    const redirectUri = pickField(req, 'redirect_uri');
    if (!code || !clientId || !redirectUri) {
      return res.status(400).json({ error: 'invalid_request' });
    }

    const tokenRecord = smartSessionStore.exchangeCode(code, clientId, redirectUri);
    if (!tokenRecord) {
      return res.status(400).json({ error: 'invalid_grant' });
    }

    return res.json({
      access_token: tokenRecord.token,
      token_type: 'Bearer',
      expires_in: Math.floor((tokenRecord.expiresAt - Date.now()) / 1000),
      scope: tokenRecord.scope,
      patient: tokenRecord.patient,
      fhirUser: tokenRecord.fhirUser,
    });
  });

  router.get('/smart/context', (req, res) => {
    const bearer = parseBearer(req);
    if (!bearer) {
      return res.status(401).json({ error: 'bearer_required' });
    }
    const record = smartSessionStore.getToken(bearer);
    if (!record) {
      return res.status(401).json({ error: 'invalid_or_expired_token' });
    }
    return res.json({
      patient: record.patient,
      practitioner: record.fhirUser,
      fhirUser: record.fhirUser,
      scope: record.scope,
    });
  });

  return router;
}

function pickField(req: Request, name: string): string | undefined {
  const body = req.body as Record<string, unknown>;
  const fromBody = body[name];
  if (typeof fromBody === 'string') return fromBody;
  const fromQuery = req.query[name];
  if (typeof fromQuery === 'string') return fromQuery;
  return undefined;
}
