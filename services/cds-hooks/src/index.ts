// CDS Hooks — bootstrap.

import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { FhirClient } from './fhir-client.js';
import { createServer } from './server.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);
  logger.info({ port: config.port, fhir: config.fhirBaseUrl }, 'Starting CDS Hooks service');

  const fhirClient = new FhirClient(config.fhirBaseUrl);
  const app = createServer({ fhirClient, logger });

  const server = app.listen(config.port, () => {
    logger.info({ port: config.port }, 'HTTP server ready');
  });

  const shutdown = (signal: string): void => {
    logger.info({ signal }, 'Shutting down');
    server.close(() => process.exit(0));
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
