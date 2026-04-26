// Översättnings-motor: kombinerar cache + fallback + upstream.
//
// Anrops-ordning:
//   1. LRU-cache (in-memory).
//   2. Fallback-tabeller (laddat från JSON vid startup).
//   3. Upstream (Snowstorm/HAPI) om konfigurerat.
//   4. notFound — räknas till counters.notFound och returnerar null.
//
// Cache:n värmer både fallback- och upstream-träffar för att hålla 99-percentil-
// latens under 1 ms. TTL 24h eftersom terminologi sällan ändras.

import { LRUCache } from 'lru-cache';
import type { Logger } from 'pino';
import type { FallbackStore } from './fallback.js';
import type { UpstreamClient } from './upstream.js';
import type {
  CodedValue,
  ExpandRequest,
  ExpandResult,
  LookupRequest,
  LookupResult,
  TranslateRequest,
} from './types.js';

interface Counters {
  translateRequests: number;
  lookupRequests: number;
  expandRequests: number;
  fallbackHits: number;
  upstreamHits: number;
  notFound: number;
  cacheHits: number;
  cacheMisses: number;
}

export class Translator {
  private translateCache: LRUCache<string, CodedValue>;
  private lookupCache: LRUCache<string, LookupResult>;
  readonly counters: Counters = {
    translateRequests: 0,
    lookupRequests: 0,
    expandRequests: 0,
    fallbackHits: 0,
    upstreamHits: 0,
    notFound: 0,
    cacheHits: 0,
    cacheMisses: 0,
  };

  constructor(
    private readonly fallback: FallbackStore,
    private readonly upstream: UpstreamClient,
    private readonly logger: Logger,
    cacheMax: number,
    cacheTtlMs: number,
  ) {
    this.translateCache = new LRUCache({ max: cacheMax, ttl: cacheTtlMs });
    this.lookupCache = new LRUCache({ max: cacheMax, ttl: cacheTtlMs });
  }

  cacheSize(): number {
    return this.translateCache.size + this.lookupCache.size;
  }

  async translate(req: TranslateRequest): Promise<CodedValue | null> {
    this.counters.translateRequests++;
    const key = `${req.source}|${req.target}|${req.code}`;
    const cached = this.translateCache.get(key);
    if (cached) {
      this.counters.cacheHits++;
      return cached;
    }
    this.counters.cacheMisses++;

    const fb = this.fallback.translate(req);
    if (fb) {
      this.counters.fallbackHits++;
      this.translateCache.set(key, fb);
      return fb;
    }

    const up = await this.upstream.translate(req);
    if (up) {
      this.counters.upstreamHits++;
      this.translateCache.set(key, up);
      return up;
    }

    this.counters.notFound++;
    this.logger.debug({ req }, 'translate: not found');
    return null;
  }

  async lookup(req: LookupRequest): Promise<LookupResult | null> {
    this.counters.lookupRequests++;
    const key = `${req.system}|${req.code}`;
    const cached = this.lookupCache.get(key);
    if (cached) {
      this.counters.cacheHits++;
      return cached;
    }
    this.counters.cacheMisses++;

    const fb = this.fallback.lookup(req.system, req.code);
    if (fb) {
      this.counters.fallbackHits++;
      this.lookupCache.set(key, fb);
      return fb;
    }

    const up = await this.upstream.lookup(req.system, req.code);
    if (up) {
      this.counters.upstreamHits++;
      this.lookupCache.set(key, up);
      return up;
    }

    this.counters.notFound++;
    return null;
  }

  /**
   * Expand: returnerar ValueSet expansion. I Sprint 1 har vi ingen ValueSet-
   * struktur i fallback — vi returnerar tom expansion med en informational
   * message så consumers vet att expand kräver upstream.
   */
  async expand(req: ExpandRequest): Promise<ExpandResult> {
    this.counters.expandRequests++;
    return {
      resourceType: 'Parameters',
      parameter: [
        { name: 'url', valueString: req.url },
        {
          name: 'message',
          valueString:
            'ValueSet expansion is not implemented in Sprint 1 fallback mode. Configure SNOWSTORM_URL/HAPI_TERMINOLOGY_URL for full expansion support.',
        },
      ],
    };
  }
}
