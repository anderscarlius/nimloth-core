// Bootstrap: läs config, ladda fallback, starta Express på port 3008.

import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { FallbackStore } from './fallback.js';
import { UpstreamClient } from './upstream.js';
import { Translator } from './translator.js';
import { createApp } from './server.js';

async function main() {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);

  const fallback = new FallbackStore();
  try {
    await fallback.load(config.fallbackPath);
    logger.info(
      { totalCodes: fallback.totalCodes(), sources: fallback.listSources() },
      'fallback loaded',
    );
  } catch (err) {
    logger.error({ err, path: config.fallbackPath }, 'fallback load failed — service will return 503');
  }

  const upstream = new UpstreamClient(config.upstream, logger);
  if (upstream.isAnyConfigured()) {
    void upstream.checkReachability().then(() => {
      logger.info({ reachability: upstream.reachability() }, 'upstream reachability check done');
    });
  } else {
    logger.info('no upstream configured — running in fallback-only mode');
  }

  const translator = new Translator(
    fallback,
    upstream,
    logger,
    config.cache.maxSize,
    config.cache.ttlMs,
  );

  const app = createApp({
    translator,
    fallback,
    upstream,
    logger,
    loadedAt: new Date().toISOString(),
  });

  app.listen(config.port, () => {
    logger.info({ port: config.port }, 'terminology service listening');
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('terminology bootstrap failed', err);
  process.exit(1);
});
