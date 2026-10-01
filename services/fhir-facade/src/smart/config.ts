// SMART on FHIR — dev-stub (WP-FHIR1). Produktions-SMART-klienter är out of scope.

import type { AuthMode } from '../auth/config.js';

export interface SmartConfig {
  /** Publik bas-URL för authorize/token (utan trailing slash). */
  publicBaseUrl: string;
  /** Monterad endast när dev-stub är aktiv. */
  enabled: boolean;
}

export function loadSmartConfig(authMode: AuthMode): SmartConfig {
  const port = process.env.FHIR_FACADE_PORT ?? process.env.PORT ?? '3003';
  const publicBaseUrl = (process.env.FHIR_FACADE_PUBLIC_URL ?? `http://localhost:${port}`).replace(/\/$/, '');
  const forceEnable = process.env.SMART_STUB_ENABLED === 'true';
  const forceDisable = process.env.SMART_STUB_ENABLED === 'false';
  const enabled = forceDisable ? false : forceEnable || authMode === 'dev';
  return { publicBaseUrl, enabled };
}
