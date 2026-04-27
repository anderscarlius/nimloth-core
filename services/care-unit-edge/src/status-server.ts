// Status-endpoint på port 3006: health + sync-metrics + offline-state.
// Konsumeras av topology-vyn i dashboarden via central replication-tjänst.

import express from 'express';
import type { CareUnitDb } from './db.js';
import type { OfflineDetector } from './offline-detector.js';
import type { SyncWorker } from './sync-worker.js';

export function createStatusServer(deps: {
  db: CareUnitDb;
  detector: OfflineDetector;
  sync: SyncWorker;
  unitId: string;
  unitName: string;
  unitHsaId: string;
}): express.Express {
  const app = express();

  app.get('/health', (_req, res) => {
    const offline = deps.detector.getState();
    res.json({
      status: 'ok',
      service: 'care-unit-edge',
      unit_id: deps.unitId,
      unit_name: deps.unitName,
      mode: offline.mode,
      central_connected: offline.mode !== 'offline',
      patients_cached: deps.db.countPatients(),
    });
  });

  app.get('/status', (_req, res) => {
    res.json({
      unit: { id: deps.unitId, name: deps.unitName, hsa_id: deps.unitHsaId, type: 'care-unit' },
      offline: deps.detector.getState(),
      sync: deps.sync.metrics,
      cache: { patients: deps.db.countPatients() },
      outbox: deps.db.outboxStats(),
    });
  });

  return app;
}
