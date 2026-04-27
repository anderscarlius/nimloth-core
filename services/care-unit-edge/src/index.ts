// Care-unit-edge bootstrap: ladda config + db + workers + tre HTTP-servrar.

import { dirname } from 'node:path';
import { mkdirSync, existsSync } from 'node:fs';
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { CareUnitDb } from './db.js';
import { OfflineDetector } from './offline-detector.js';
import { SyncWorker } from './sync-worker.js';
import { createFhirServer } from './fhir-server.js';
import { createCdsServer } from './cds-server.js';
import { createStatusServer } from './status-server.js';

async function main() {
  const config = loadConfig();
  const logger = createLogger(config.logLevel, config.unitId);
  logger.info({ config: { ...config, central: { baseUrl: config.central.baseUrl, timeoutMs: config.central.timeoutMs } } }, 'starting care-unit-edge');

  // Säkerställ att db-katalog finns (i container = /data, mountad volym)
  const dbDir = dirname(config.dbPath);
  if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });

  const db = new CareUnitDb(config.dbPath);
  db.migrate(config.migrationsPath, logger);
  logger.info({ patients: db.countPatients() }, 'db ready');

  const detector = new OfflineDetector(
    {
      centralUrl: config.central.baseUrl,
      intervalMs: config.offline.pingIntervalMs,
      maxFailedPings: config.offline.maxFailedPings,
      timeoutMs: config.central.timeoutMs,
    },
    logger,
  );

  const sync = new SyncWorker(
    {
      centralUrl: config.central.baseUrl,
      timeoutMs: config.central.timeoutMs,
      pushBatchSize: config.sync.pushBatchSize,
      pushIntervalMs: config.sync.pushIntervalMs,
      pullIntervalMs: config.sync.pullIntervalMs,
      heartbeatIntervalMs: config.sync.heartbeatIntervalMs,
      unitId: config.unitId,
      unitName: config.unitName,
      unitHsaId: config.unitHsaId,
      listedPatients: config.listedPatients,
    },
    db,
    detector,
    logger,
  );

  detector.start();
  sync.start();

  const fhir = createFhirServer({ db, logger, unitId: config.unitId, unitHsaId: config.unitHsaId });
  const cds = createCdsServer({ db, logger, unitId: config.unitId });
  const status = createStatusServer({
    db,
    detector,
    sync,
    unitId: config.unitId,
    unitName: config.unitName,
    unitHsaId: config.unitHsaId,
  });

  fhir.listen(config.ports.fhir, () => logger.info({ port: config.ports.fhir }, 'FHIR-server listening'));
  cds.listen(config.ports.cds, () => logger.info({ port: config.ports.cds }, 'CDS-server listening'));
  status.listen(config.ports.status, () => logger.info({ port: config.ports.status }, 'status-server listening'));

  // Initial pull för att hydrera lokal cache (best-effort)
  void sync.runPull();

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down');
    detector.stop();
    sync.stop();
    db.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('care-unit-edge bootstrap failed', err);
  process.exit(1);
});
