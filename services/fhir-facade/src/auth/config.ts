// Auth-konfiguration — AUTH_MODE styr dev-stub vs Keycloak JWT (DP-IN2).

export type AuthMode = 'dev' | 'keycloak' | 'siths';

export interface AuthConfig {
  mode: AuthMode;
  /** Issuer URL, t.ex. http://localhost:8180/realms/nimloth-core */
  keycloakIssuer: string;
  /** Om satt, krävs matchande `aud` / `azp` i JWT. */
  keycloakAudience?: string;
  /** JWT-claim som bär HSA-id (Keycloak user attribute / protocol mapper). */
  hsaClaim: string;
  /** Bas-URL till lokal HSA-stub (valfritt). Om satt valideras HSA-id efter JWT. */
  hsaServiceUrl?: string;
}

function parseAuthMode(raw: string): AuthMode {
  const v = raw.toLowerCase();
  if (v === 'dev' || v === 'keycloak' || v === 'siths') return v;
  // eslint-disable-next-line no-console
  console.warn(`Invalid AUTH_MODE=${raw}, defaulting to dev`);
  return 'dev';
}

export function loadAuthConfig(): AuthConfig {
  const mode = parseAuthMode(process.env.AUTH_MODE ?? 'dev');
  const issuer =
    process.env.KEYCLOAK_ISSUER ??
    (mode === 'dev'
      ? 'http://localhost:8180/realms/nimloth-core'
      : 'http://keycloak:8080/realms/nimloth-core');

  const audience = process.env.KEYCLOAK_AUDIENCE?.trim() || undefined;
  const hsaServiceUrl = process.env.HSA_SERVICE_URL?.replace(/\/$/, '') || undefined;

  return {
    mode,
    keycloakIssuer: issuer.replace(/\/$/, ''),
    keycloakAudience: audience,
    hsaClaim: process.env.AUTH_HSA_CLAIM ?? 'hsa_id',
    hsaServiceUrl: mode === 'dev' ? undefined : hsaServiceUrl,
  };
}
