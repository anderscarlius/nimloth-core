// Edge-nod bootstrap — laddar konfig, startar runtime, hanterar graceful shutdown.

import { loadEdgeConfig } from './config.js';
import { createLogger } from './logger.js';
import { startEdgeRuntime } from './edge-runtime.js';

async function main(): Promise<void> {
  const config = loadEdgeConfig();
  const logger = createLogger(config.logLevel, config.instanceId);

  const handles = await startEdgeRuntime(config, logger);

  logger.info(
    { mode: handles.sync.getState().mode, online: handles.detector.getStatus().online },
    `edge node ${config.instanceId} online`,
  );

  const shutdown = (signal: string): void => {
    logger.info({ signal }, 'edge shutdown requested');
    handles
      .stop()
      .then(() => process.exit(0))
      .catch((err) => {
        logger.error({ err }, 'edge shutdown error');
        process.exit(1);
      });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[edge] fatal:', err);
  process.exit(1);
});
