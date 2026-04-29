// Store-router — väljer FhirStore baserat på CANONICAL_STORE-config.
//
// CANONICAL_STORE-värden:
//   - "postgres" (default): bara postgres används. openEHR ignoreras.
//   - "openehr": openehr används som primär läsväg. Postgres är tillgängligt
//     men anropas inte automatiskt.
//   - "both": postgres är primär, openehr är skuggläst (för P3.4 paritetsdiff).
//     I P3.3 räcker det att flag accepteras — faktisk both-routing kommer i P3.4.
//
// Routern är immutable efter init. Konfig-ändring kräver omstart.

import type pg from 'pg';
import type { Logger } from 'pino';
import type { FhirStore, CanonicalStore } from './types.js';
import { PostgresStore } from './postgres-store.js';
import { OpenehrStore } from './openehr/index.js';
import { CoverageTracker } from './openehr/coverage-tracker.js';

export type CanonicalStoreMode = 'postgres' | 'openehr' | 'both';

export interface StoreRouter {
  readonly mode: CanonicalStoreMode;
  /** Den primära store som används för read-anrop. */
  readonly primary: FhirStore;
  /** Sekundär store (för paritet/skugg-läsning). null när mode='postgres'. */
  readonly secondary: FhirStore | null;
  /** OpenEHR-coverage delas med /facade/coverage-endpoint. Alltid en instans
   *  så endpoint-route inte måste hantera optional. Tom map om openEHR inte
   *  används. */
  readonly coverage: CoverageTracker;
  /** Vilken store som faktiskt svarade på senaste anrop — sätts av handlers
   *  så audit-middleware kan logga rätt fält. */
  readonly canonicalStoreUsed: CanonicalStore;
}

export interface CreateStoreRouterOpts {
  pool: pg.Pool;
  ehrbaseUrl: string;
  mode: CanonicalStoreMode;
  logger: Logger;
}

export function createStoreRouter(opts: CreateStoreRouterOpts): StoreRouter {
  const coverage = new CoverageTracker();
  const postgres = new PostgresStore(opts.pool);
  const openehr =
    opts.mode === 'postgres'
      ? null
      : new OpenehrStore({
          pool: opts.pool,
          ehrbaseUrl: opts.ehrbaseUrl,
          coverage,
          logger: opts.logger.child({ store: 'openehr' }),
        });

  // Primary följer mode. Both-läge: primary=postgres tills P3.4 wirar in
  // skugg-läsning + diff-rapport.
  const primary: FhirStore =
    opts.mode === 'openehr' && openehr ? openehr : postgres;
  const secondary: FhirStore | null =
    opts.mode === 'both' && openehr ? openehr : null;

  return {
    mode: opts.mode,
    primary,
    secondary,
    coverage,
    canonicalStoreUsed: primary.canonicalStore,
  };
}

export type { FhirStore, StoreContext, CanonicalStore } from './types.js';
export { CoverageTracker } from './openehr/coverage-tracker.js';
