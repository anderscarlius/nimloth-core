// JWT-validering mot Keycloak JWKS (issuer /protocol/openid-connect/certs).

import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { AuthConfig } from './config.js';

export interface JwtVerifyDeps {
  /** Test-injektion: lokal JWKS i stället för HTTP-fetch mot Keycloak. */
  getKey?: JWTVerifyGetKey;
}

function jwksUrl(issuer: string): URL {
  return new URL(`${issuer.replace(/\/$/, '')}/protocol/openid-connect/certs`);
}

const remoteJwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function remoteJwks(issuer: string): JWTVerifyGetKey {
  const cached = remoteJwksCache.get(issuer);
  if (cached) return cached;
  const set = createRemoteJWKSet(jwksUrl(issuer));
  remoteJwksCache.set(issuer, set);
  return set;
}

export async function verifyBearerJwt(
  token: string,
  config: AuthConfig,
  deps: JwtVerifyDeps = {},
): Promise<Record<string, unknown>> {
  const key = deps.getKey ?? remoteJwks(config.keycloakIssuer);
  const { payload } = await jwtVerify(token, key, {
    issuer: config.keycloakIssuer,
    audience: config.keycloakAudience,
  });
  return payload as Record<string, unknown>;
}
