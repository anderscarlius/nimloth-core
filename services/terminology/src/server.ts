// Express-server för terminologitjänsten. Tunna routes som mappar till Translator.

import express, { type Request, type Response } from 'express';
import type { Logger } from 'pino';
import type { FallbackStore } from './fallback.js';
import type { Translator } from './translator.js';
import type { UpstreamClient } from './upstream.js';
import type {
  ExpandRequest,
  LookupRequest,
  TerminologyStatus,
  TranslateRequest,
} from './types.js';

export interface ServerDeps {
  translator: Translator;
  fallback: FallbackStore;
  upstream: UpstreamClient;
  logger: Logger;
  loadedAt: string;
}

export function createApp(deps: ServerDeps): express.Express {
  const app = express();
  app.use(express.json({ limit: '256kb' }));

  // -----------------------------------------------------------------
  // Health
  // -----------------------------------------------------------------
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'terminology',
      fallbackLoaded: deps.fallback.isLoaded(),
    });
  });

  // -----------------------------------------------------------------
  // Status — observerbarhet och dashboard-input
  // -----------------------------------------------------------------
  app.get('/system-status', async (_req, res) => {
    const reach = deps.upstream.reachability();
    const status: TerminologyStatus = {
      status: deps.fallback.isLoaded() ? 'ok' : 'degraded',
      service: 'terminology',
      loadedAt: deps.loadedAt,
      fallback: {
        version: deps.fallback.isLoaded() ? deps.fallback.getRaw().version : 'n/a',
        sources: deps.fallback.listSources(),
        totalCodes: deps.fallback.totalCodes(),
      },
      upstream: reach,
      cache: {
        size: deps.translator.cacheSize(),
        hits: deps.translator.counters.cacheHits,
        misses: deps.translator.counters.cacheMisses,
      },
      counters: {
        translateRequests: deps.translator.counters.translateRequests,
        lookupRequests: deps.translator.counters.lookupRequests,
        expandRequests: deps.translator.counters.expandRequests,
        fallbackHits: deps.translator.counters.fallbackHits,
        upstreamHits: deps.translator.counters.upstreamHits,
        notFound: deps.translator.counters.notFound,
      },
    };
    res.json(status);
  });

  // -----------------------------------------------------------------
  // Snapshot — fallback-data exponerat för warm-start av klienter (transform)
  // -----------------------------------------------------------------
  app.get('/snapshot', (_req, res) => {
    if (!deps.fallback.isLoaded()) {
      res.status(503).json({ error: 'fallback not loaded' });
      return;
    }
    res.json(deps.fallback.snapshot());
  });

  // -----------------------------------------------------------------
  // Translate
  // -----------------------------------------------------------------
  app.post('/translate', async (req: Request, res: Response) => {
    const body = req.body as Partial<TranslateRequest> | undefined;
    if (!body || typeof body.source !== 'string' || typeof body.target !== 'string' || typeof body.code !== 'string') {
      res.status(400).json({ error: 'expected { source, target, code } strings' });
      return;
    }
    try {
      const result = await deps.translator.translate(body as TranslateRequest);
      if (!result) {
        res.status(404).json({ error: 'not found', source: body.source, target: body.target, code: body.code });
        return;
      }
      res.json(result);
    } catch (err) {
      deps.logger.error({ err, body }, 'translate failed');
      res.status(500).json({ error: 'internal' });
    }
  });

  // -----------------------------------------------------------------
  // Lookup
  // -----------------------------------------------------------------
  app.post('/lookup', async (req: Request, res: Response) => {
    const body = req.body as Partial<LookupRequest> | undefined;
    if (!body || typeof body.system !== 'string' || typeof body.code !== 'string') {
      res.status(400).json({ error: 'expected { system, code } strings' });
      return;
    }
    try {
      const result = await deps.translator.lookup(body as LookupRequest);
      if (!result) {
        res.status(404).json({ error: 'not found', system: body.system, code: body.code });
        return;
      }
      res.json(result);
    } catch (err) {
      deps.logger.error({ err, body }, 'lookup failed');
      res.status(500).json({ error: 'internal' });
    }
  });

  // -----------------------------------------------------------------
  // Expand (ValueSet) — stub i Sprint 1, placeholder för upstream-baserad
  //                    expansion när Snowstorm/HAPI är wired in.
  // -----------------------------------------------------------------
  app.post('/expand', async (req: Request, res: Response) => {
    const body = req.body as Partial<ExpandRequest> | undefined;
    if (!body || typeof body.url !== 'string') {
      res.status(400).json({ error: 'expected { url } string' });
      return;
    }
    try {
      const result = await deps.translator.expand(body as ExpandRequest);
      res.json(result);
    } catch (err) {
      deps.logger.error({ err, body }, 'expand failed');
      res.status(500).json({ error: 'internal' });
    }
  });

  return app;
}
