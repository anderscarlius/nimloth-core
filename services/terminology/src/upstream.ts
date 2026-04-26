// Upstream-klienter mot Snowstorm (SNOMED CT) och HAPI FHIR Terminology
// (LOINC, ICD-10-SE).
//
// Designprincip: failure i upstream blockerar aldrig anropet — fallback täcker
// alla kritiska koder för Fru Andersson-scenariot. Upstream är en utöknings-
// väg när Snowstorm-lite eller full Snowstorm rullas ut.
//
// Status (Sprint 1): klienterna är skelett som default-disablas. Tas i drift
// när compose-profilen `terminology-full` aktiveras.

import type { Logger } from 'pino';
import type { UpstreamConfig } from './config.js';
import type { CodedValue, LookupResult } from './types.js';

interface ReachabilityState {
  configured: boolean;
  reachable: boolean | null;
  lastCheckedAt: number;
}

export class UpstreamClient {
  private snowstorm: ReachabilityState;
  private hapi: ReachabilityState;

  constructor(
    private readonly cfg: UpstreamConfig,
    private readonly logger: Logger,
  ) {
    this.snowstorm = {
      configured: cfg.snowstormUrl.length > 0,
      reachable: null,
      lastCheckedAt: 0,
    };
    this.hapi = {
      configured: cfg.hapiTerminologyUrl.length > 0,
      reachable: null,
      lastCheckedAt: 0,
    };
  }

  isAnyConfigured(): boolean {
    return this.snowstorm.configured || this.hapi.configured;
  }

  reachability() {
    return {
      snowstorm: { configured: this.snowstorm.configured, reachable: this.snowstorm.reachable },
      hapi: { configured: this.hapi.configured, reachable: this.hapi.reachable },
    };
  }

  /** Begär översättning. Returnerar null om upstream är oavsedd eller misslyckas. */
  async translate(_args: { source: string; target: string; code: string }): Promise<CodedValue | null> {
    if (!this.isAnyConfigured()) return null;
    // Stub: full upstream-implementation kommer i Sprint 1.5 / nästa iteration.
    // Vi vill ha klienterna på plats arkitekturellt utan att dra in Snowstorm-
    // bootstrapen i Sprint 1-leveransen.
    this.logger.debug({ args: _args }, 'upstream translate not yet wired');
    return null;
  }

  async lookup(_system: string, _code: string): Promise<LookupResult | null> {
    if (!this.isAnyConfigured()) return null;
    this.logger.debug({ system: _system, code: _code }, 'upstream lookup not yet wired');
    return null;
  }

  /** Pinga upstream-tjänsterna och uppdatera reachability. */
  async checkReachability(): Promise<void> {
    if (this.snowstorm.configured) {
      this.snowstorm.reachable = await this.ping(`${this.cfg.snowstormUrl}/metadata`);
      this.snowstorm.lastCheckedAt = Date.now();
    }
    if (this.hapi.configured) {
      this.hapi.reachable = await this.ping(`${this.cfg.hapiTerminologyUrl}/metadata`);
      this.hapi.lastCheckedAt = Date.now();
    }
  }

  private async ping(url: string): Promise<boolean> {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), this.cfg.timeoutMs);
      const r = await fetch(url, { signal: ctrl.signal });
      clearTimeout(t);
      return r.ok;
    } catch {
      return false;
    }
  }
}
