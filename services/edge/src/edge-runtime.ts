// Edge runtime — koordinerar alla edge-komponenter.
//
// Uppstart:
//   1. Läs EdgeConfig (env)
//   2. Initiera SQLite FHIR-cache
//   3. Starta OfflineDetector (pingar central)
//   4. Starta SyncManager (inbound central→cache, outbound local→central)
//   5. Starta lokal FHIR-server (replica-mode) på EDGE_FHIR_PORT
//   6. Starta lokal CDS Hooks-server på EDGE_CDS_PORT
//   7. Starta Status-server (/health + /status) + StatusReporter (heartbeat)

import express from 'express';
import { Kafka } from 'kafkajs';
import type { Server } from 'node:http';
import type { Logger } from 'pino';

import type { EdgeConfig } from './config.js';
import { FhirCache } from './fhir-cache.js';
import { OfflineDetector } from './offline-detector.js';
import { SyncManager } from './sync-manager.js';
import { StatusReporter } from './status-reporter.js';
import { createFhirServer } from './fhir-server.js';
import { createCdsServer } from './cds-server.js';

export interface EdgeRuntimeHandles {
  stop(): Promise<void>;
  cache: FhirCache;
  detector: OfflineDetector;
  sync: SyncManager;
  reporter: StatusReporter;
  ports: { fhir: number; cds: number; status: number };
}

export async function startEdgeRuntime(
  config: EdgeConfig,
  logger: Logger,
): Promise<EdgeRuntimeHandles> {
  logger.info(
    {
      instance_id: config.instanceId,
      instance_name: config.instanceName,
      hospital: config.hospitalName,
      central_fhir: config.centralHub.fhirBaseUrl,
      local_kafka: config.localKafka.brokers,
      central_kafka: config.centralKafka.brokers,
      sqlite: config.fhirCache.sqlitePath,
    },
    'edge runtime starting',
  );

  // 1. FHIR-cache
  const cache = new FhirCache(config.fhirCache.sqlitePath, logger);

  // 2. OfflineDetector
  const detector = new OfflineDetector(
    {
      centralHealthUrl: config.centralHub.healthUrl,
      pingIntervalMs: config.offline.pingIntervalMs,
      pingTimeoutMs: config.offline.pingTimeoutMs,
      maxRetries: config.offline.maxRetries,
    },
    logger,
  );
  detector.start();

  // 3. SyncManager
  const sync = new SyncManager({ config, cache, detector, logger });
  // Starta utan att blocka uppstarten av FHIR/CDS-servrarna
  void sync.start().catch((err) => logger.error({ err }, 'sync-manager start failed'));

  // 4. Lokal FHIR-server (replica)
  const fhirApp = createFhirServer({ config, cache, logger });
  const fhirServer = fhirApp.listen(config.ports.fhir, () =>
    logger.info({ port: config.ports.fhir }, 'edge FHIR server listening'),
  );

  // 5. Lokal CDS-server
  const cdsApp = createCdsServer({ config, cache, logger });
  const cdsServer = cdsApp.listen(config.ports.cds, () =>
    logger.info({ port: config.ports.cds }, 'edge CDS server listening'),
  );

  // 6. Status-server (/health + /status)
  const statusKafka = new Kafka({
    clientId: `${config.localKafka.clientId}-status`,
    brokers: config.centralKafka.brokers,
    retry: { retries: 6, initialRetryTime: 500 },
  });
  const reporter = new StatusReporter({
    config,
    kafka: statusKafka,
    cache,
    detector,
    sync,
    logger,
  });
  await reporter.start(30_000);

  const statusApp = express();
  statusApp.get('/health', (_req, res) => {
    const online = detector.getStatus().online;
    res.status(online ? 200 : 503).json({
      status: online ? 'ok' : 'degraded',
      service: 'edge-runtime',
      instance_id: config.instanceId,
      mode: sync.getState().mode,
      central_hub_connected: online,
    });
  });
  statusApp.get('/status', (_req, res) => {
    res.json(reporter.buildHeartbeat());
  });
  statusApp.get('/metrics', (_req, res) => {
    const hb = reporter.buildHeartbeat();
    res.type('text/plain').send(
      [
        `# HELP core_edge_up Edge node up`,
        `# TYPE core_edge_up gauge`,
        `core_edge_up{instance="${hb.instance_id}"} 1`,
        `core_edge_buffered_events{instance="${hb.instance_id}"} ${hb.metrics.buffered_events}`,
        `core_edge_cache_patients{instance="${hb.instance_id}"} ${hb.metrics.fhir_cache_patients}`,
        `core_edge_central_hub_connected{instance="${hb.instance_id}"} ${hb.metrics.central_hub_connected ? 1 : 0}`,
      ].join('\n'),
    );
  });
  const statusServer = statusApp.listen(config.ports.status, () =>
    logger.info({ port: config.ports.status }, 'edge status server listening'),
  );

  const stop = async (): Promise<void> => {
    logger.info('edge runtime stopping');
    detector.stop();
    await reporter.stop();
    await sync.stop();
    await Promise.all(
      [fhirServer, cdsServer, statusServer].map(
        (s: Server) => new Promise<void>((resolve) => s.close(() => resolve())),
      ),
    );
    cache.close();
  };

  return {
    stop,
    cache,
    detector,
    sync,
    reporter,
    ports: config.ports,
  };
}
