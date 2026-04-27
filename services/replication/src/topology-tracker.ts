// TopologyTracker — konsumerar core.system.edge.heartbeat och håller en
// in-memory map av senaste status per edge-instans. Används av GET /topology
// för att mata dashboardens topologi-vy.

import type { Kafka, Consumer } from 'kafkajs';
import type { Logger } from 'pino';

export type EdgeKind = 'hospital' | 'care-unit' | 'client';

export interface EdgeHeartbeat {
  instance_id: string;
  instance_name: string;
  hospital_name: string;
  hsa_id: string;
  timestamp: string;
  status: 'online' | 'offline' | 'replaying';
  edge_type: EdgeKind;
  metrics: {
    cdc_events_processed?: number;
    fhir_cache_patients?: number;
    fhir_cache_size_mb?: number;
    buffered_events?: number;
    replication_lag_ms?: number;
    uptime_seconds?: number;
    central_hub_connected?: boolean;
    /** För care-unit-edge: outbox-statistik. */
    outbox_pending?: number;
    outbox_synced?: number;
  };
}

export interface EdgeNodeView extends EdgeHeartbeat {
  last_seen: string;
  stale: boolean;
}

export interface TopologyView {
  central: {
    name: string;
    status: 'online';
  };
  edges: EdgeNodeView[];
  generated_at: string;
}

/** En heartbeat anses "stale" om senaste timestamp är äldre än detta. */
const STALE_THRESHOLD_MS = 90_000;

export interface TopologyTrackerDeps {
  kafka: Kafka;
  logger: Logger;
}

export class TopologyTracker {
  private consumer: Consumer | null = null;
  private readonly latest = new Map<string, EdgeHeartbeat & { receivedAt: number }>();

  constructor(private readonly deps: TopologyTrackerDeps) {}

  async start(): Promise<void> {
    const { kafka, logger } = this.deps;
    this.consumer = kafka.consumer({
      groupId: `central-topology-${Date.now()}`,
      allowAutoTopicCreation: true,
    });
    try {
      await this.consumer.connect();
      await this.consumer.subscribe({
        topics: ['core.system.edge.heartbeat'],
        fromBeginning: true,
      });
      await this.consumer.run({
        eachMessage: async ({ message }) => {
          if (!message.value) return;
          try {
            const raw = JSON.parse(message.value.toString()) as Record<string, unknown>;
            const hb = normalizeHeartbeat(raw);
            if (hb.instance_id) {
              this.latest.set(hb.instance_id, { ...hb, receivedAt: Date.now() });
            }
          } catch (err) {
            logger.warn({ err }, 'topology-tracker: invalid heartbeat payload');
          }
        },
      });
      logger.info('topology-tracker started (consuming core.system.edge.heartbeat)');
    } catch (err) {
      logger.warn({ err }, 'topology-tracker: consumer failed to start');
    }
  }

  getTopology(): TopologyView {
    const now = Date.now();
    const edges: EdgeNodeView[] = [];
    for (const [, hb] of this.latest) {
      const age = now - hb.receivedAt;
      const stale = age > STALE_THRESHOLD_MS;
      edges.push({
        ...hb,
        last_seen: new Date(hb.receivedAt).toISOString(),
        stale,
        // Om heartbeat är stale, rapportera status som 'offline' så UI:t blir
        // konsistent även om edge-noden aldrig hann skicka en "offline"-heartbeat.
        status: stale ? 'offline' : hb.status,
      });
    }
    edges.sort((a, b) => a.instance_id.localeCompare(b.instance_id));
    return {
      central: { name: 'Central hub (Dalahubben)', status: 'online' },
      edges,
      generated_at: new Date(now).toISOString(),
    };
  }

  async stop(): Promise<void> {
    try {
      await this.consumer?.disconnect();
    } catch {
      /* noop */
    }
  }
}

/**
 * Normaliserar heartbeats från olika edge-typer (sjukhus-edge har en
 * shape, care-unit-edge en annan). Returnerar en gemensam EdgeHeartbeat.
 */
function normalizeHeartbeat(raw: Record<string, unknown>): EdgeHeartbeat {
  const isCareUnit = raw.edge_type === 'care-unit' || raw.unit_id !== undefined;
  if (isCareUnit) {
    const unitId = (raw.unit_id as string) ?? (raw.instance_id as string) ?? 'unknown';
    const outbox = (raw.outbox as { pending?: number; synced?: number } | undefined) ?? {};
    const mode = (raw.mode as string) ?? 'unknown';
    const status: EdgeHeartbeat['status'] =
      mode === 'realtime' || mode === 'degraded'
        ? 'online'
        : mode === 'reconnecting'
          ? 'replaying'
          : 'offline';
    return {
      instance_id: unitId,
      instance_name: (raw.unit_name as string) ?? unitId,
      hospital_name: (raw.unit_name as string) ?? 'Vårdcentral',
      hsa_id: (raw.unit_hsa_id as string) ?? '',
      timestamp: (raw.timestamp as string) ?? new Date().toISOString(),
      status,
      edge_type: 'care-unit',
      metrics: {
        fhir_cache_patients: typeof raw.patients_cached === 'number' ? (raw.patients_cached as number) : undefined,
        outbox_pending: outbox.pending,
        outbox_synced: outbox.synced,
        central_hub_connected: status !== 'offline',
      },
    };
  }
  // Sjukhus-edge — antag att shape:n är som EdgeHeartbeat
  return {
    instance_id: raw.instance_id as string,
    instance_name: (raw.instance_name as string) ?? '',
    hospital_name: (raw.hospital_name as string) ?? '',
    hsa_id: (raw.hsa_id as string) ?? '',
    timestamp: (raw.timestamp as string) ?? new Date().toISOString(),
    status: (raw.status as EdgeHeartbeat['status']) ?? 'online',
    edge_type: 'hospital',
    metrics: (raw.metrics as EdgeHeartbeat['metrics']) ?? {},
  };
}
