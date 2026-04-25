// StatusReporter — publicerar edge-heartbeat var 30:e sekund till central Kafka
// (topic `core.system.edge.heartbeat`). Centrala dashboarden konsumerar detta
// (Prompt 15) för att visa topologi-status.

import type { Kafka, Producer } from 'kafkajs';
import type { Logger } from 'pino';
import type { EdgeConfig } from './config.js';
import type { FhirCache } from './fhir-cache.js';
import type { OfflineDetector } from './offline-detector.js';
import type { SyncManager } from './sync-manager.js';

export interface EdgeHeartbeat {
  instance_id: string;
  instance_name: string;
  hospital_name: string;
  hsa_id: string;
  timestamp: string;
  status: 'online' | 'offline' | 'replaying';
  metrics: {
    cdc_events_processed: number;
    fhir_cache_patients: number;
    fhir_cache_size_mb: number;
    buffered_events: number;
    replication_lag_ms: number;
    uptime_seconds: number;
    central_hub_connected: boolean;
  };
}

export interface StatusReporterDeps {
  config: EdgeConfig;
  kafka: Kafka;
  cache: FhirCache;
  detector: OfflineDetector;
  sync: SyncManager;
  logger: Logger;
}

export class StatusReporter {
  private producer: Producer | null = null;
  private intervalHandle: NodeJS.Timeout | null = null;
  private readonly startedAt = Date.now();

  constructor(private readonly deps: StatusReporterDeps) {}

  async start(intervalMs = 30_000): Promise<void> {
    this.producer = this.deps.kafka.producer({ allowAutoTopicCreation: true });
    try {
      await this.producer.connect();
    } catch (err) {
      this.deps.logger.warn({ err }, 'status-reporter: producer connect failed');
    }

    // Omedelbar första heartbeat + sedan periodvis
    void this.emit();
    this.intervalHandle = setInterval(() => void this.emit(), intervalMs);
  }

  async stop(): Promise<void> {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    try {
      await this.producer?.disconnect();
    } catch {
      /* noop */
    }
  }

  buildHeartbeat(): EdgeHeartbeat {
    const { config, cache, detector, sync } = this.deps;
    const status = detector.getStatus();
    const syncState = sync.getState();
    const mode: EdgeHeartbeat['status'] =
      syncState.mode === 'replaying' ? 'replaying' : status.online ? 'online' : 'offline';
    return {
      instance_id: config.instanceId,
      instance_name: config.instanceName,
      hospital_name: config.hospitalName,
      hsa_id: config.hsaId,
      timestamp: new Date().toISOString(),
      status: mode,
      metrics: {
        cdc_events_processed: syncState.forwardedEvents,
        fhir_cache_patients: cache.patientCount(),
        fhir_cache_size_mb: Math.round((cache.sizeBytes() / (1024 * 1024)) * 100) / 100,
        buffered_events: syncState.bufferedEvents,
        replication_lag_ms: syncState.replicationLagMs,
        uptime_seconds: Math.round((Date.now() - this.startedAt) / 1000),
        central_hub_connected: status.online,
      },
    };
  }

  private async emit(): Promise<void> {
    const heartbeat = this.buildHeartbeat();
    if (!this.producer) return;
    try {
      await this.producer.send({
        topic: 'core.system.edge.heartbeat',
        messages: [
          {
            key: heartbeat.instance_id,
            value: JSON.stringify(heartbeat),
          },
        ],
      });
    } catch (err) {
      this.deps.logger.debug({ err }, 'heartbeat send failed (central unreachable)');
    }
  }
}
