// SyncWorker — periodisk push (outbox → central) + pull (central → SQLite)
// + heartbeat. Triggas av node-cron.
//
// Design:
//   - Push först (vi vill skicka iväg lokala writes så fort som möjligt).
//   - Pull därefter (uppdatera lokal cache med deltas från central).
//   - Heartbeat tickar separat (snabbare frekvens).
//   - Skickar inget om OfflineDetector säger offline — wait för reconnect.

import type { Logger } from 'pino';
import type { CareUnitDb } from './db.js';
import type { OfflineDetector } from './offline-detector.js';

interface PullEvent {
  resource_type: 'Patient' | 'Observation' | 'MedicationStatement' | 'Condition' | 'AllergyIntolerance' | 'Procedure' | 'Encounter';
  resource_id: string;
  patient_pnr: string;
  payload: Record<string, unknown>;
  source_system?: string;
  cursor: string;
}

export interface SyncMetrics {
  pushedTotal: number;
  pulledTotal: number;
  heartbeatTotal: number;
  lastPushAt: string | null;
  lastPullAt: string | null;
  lastHeartbeatAt: string | null;
  lastError: string | null;
}

export class SyncWorker {
  readonly metrics: SyncMetrics = {
    pushedTotal: 0,
    pulledTotal: 0,
    heartbeatTotal: 0,
    lastPushAt: null,
    lastPullAt: null,
    lastHeartbeatAt: null,
    lastError: null,
  };

  private timers: ReturnType<typeof setInterval>[] = [];

  constructor(
    private readonly cfg: {
      centralUrl: string;
      timeoutMs: number;
      pushBatchSize: number;
      pushIntervalMs: number;
      pullIntervalMs: number;
      heartbeatIntervalMs: number;
      unitId: string;
      unitName: string;
      unitHsaId: string;
      listedPatients: string[];
    },
    private readonly db: CareUnitDb,
    private readonly detector: OfflineDetector,
    private readonly logger: Logger,
  ) {}

  start(): void {
    // Initial körning + intervall
    this.timers.push(setInterval(() => void this.runPush(), this.cfg.pushIntervalMs));
    this.timers.push(setInterval(() => void this.runPull(), this.cfg.pullIntervalMs));
    this.timers.push(setInterval(() => void this.runHeartbeat(), this.cfg.heartbeatIntervalMs));
    // Trigger reconnect-flush
    this.detector.on('reconnected', () => {
      this.logger.info('reconnected — kicking immediate push + pull');
      void this.runPush();
      void this.runPull();
    });
  }

  stop(): void {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
  }

  async runPush(): Promise<void> {
    if (this.detector.getState().mode === 'offline') return;
    const pending = this.db.pendingOutbox(this.cfg.pushBatchSize);
    if (pending.length === 0) return;
    const url = `${this.cfg.centralUrl.replace(/\/$/, '')}/sync/push`;
    try {
      const res = await this.fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Care-Unit-ID': this.cfg.unitId },
        body: JSON.stringify({
          unit_id: this.cfg.unitId,
          unit_hsa_id: this.cfg.unitHsaId,
          events: pending.map((p) => ({
            event_type: p.event_type,
            resource_type: p.resource_type,
            resource_id: p.resource_id,
            payload: JSON.parse(p.payload),
            payload_hash: p.payload_hash,
            created_at: p.created_at,
          })),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.db.markSynced(pending.map((p) => p.id));
      this.metrics.pushedTotal += pending.length;
      this.metrics.lastPushAt = new Date().toISOString();
      this.logger.info({ count: pending.length }, 'pushed batch');
    } catch (err) {
      this.metrics.lastError = String(err);
      // Markera per-row som failed (sync_attempts++) men låt dem ligga kvar
      for (const p of pending) this.db.markAttemptFailed(p.id, String(err));
      this.logger.warn({ err: String(err), count: pending.length }, 'push failed');
    }
  }

  async runPull(): Promise<void> {
    if (this.detector.getState().mode === 'offline') return;
    const cursor = this.db.getSyncState('pull_cursor') ?? '0';
    const url = `${this.cfg.centralUrl.replace(/\/$/, '')}/sync/pull?since=${encodeURIComponent(cursor)}&patientIds=${encodeURIComponent(this.cfg.listedPatients.join(','))}&unitId=${encodeURIComponent(this.cfg.unitId)}`;
    try {
      const res = await this.fetchWithTimeout(url, { method: 'GET' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { events: PullEvent[]; cursor: string };
      let applied = 0;
      let lastCursor = cursor;
      for (const ev of data.events) {
        try {
          if (ev.resource_type === 'Patient') {
            const p = ev.payload as Record<string, unknown>;
            this.db.upsertPatient({
              personnummer: ev.patient_pnr,
              fornamn: (p['fornamn'] as string) ?? null,
              efternamn: (p['efternamn'] as string) ?? null,
              fodelsedatum: (p['fodelsedatum'] as string) ?? null,
              kon: (p['kon'] as string) ?? null,
              source_systems: Array.isArray(p['source_systems'])
                ? (p['source_systems'] as string[])
                : undefined,
              event_data: p,
            });
          } else {
            this.db.applyResource({
              resource_type: ev.resource_type,
              resource_id: ev.resource_id,
              patient_pnr: ev.patient_pnr,
              payload: ev.payload,
              source_system: ev.source_system,
            });
          }
          applied++;
          lastCursor = ev.cursor;
        } catch (rowErr) {
          this.logger.warn({ rowErr: String(rowErr), ev: ev.resource_id }, 'pull apply row failed');
        }
      }
      if (data.cursor) lastCursor = data.cursor;
      if (lastCursor !== cursor) this.db.setSyncState('pull_cursor', lastCursor);
      this.metrics.pulledTotal += applied;
      this.metrics.lastPullAt = new Date().toISOString();
      if (applied > 0) this.logger.info({ applied, cursor: lastCursor }, 'pulled batch');
    } catch (err) {
      this.metrics.lastError = String(err);
      this.logger.debug({ err: String(err) }, 'pull failed');
    }
  }

  async runHeartbeat(): Promise<void> {
    const state = this.detector.getState();
    const url = `${this.cfg.centralUrl.replace(/\/$/, '')}/sync/heartbeat`;
    try {
      const res = await this.fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unit_id: this.cfg.unitId,
          unit_name: this.cfg.unitName,
          unit_hsa_id: this.cfg.unitHsaId,
          mode: state.mode,
          patients_cached: this.db.countPatients(),
          outbox: this.db.outboxStats(),
          last_sync: {
            pushed_total: this.metrics.pushedTotal,
            pulled_total: this.metrics.pulledTotal,
            last_push_at: this.metrics.lastPushAt,
            last_pull_at: this.metrics.lastPullAt,
          },
          edge_type: 'care-unit',
        }),
      });
      if (res.ok) {
        this.metrics.heartbeatTotal++;
        this.metrics.lastHeartbeatAt = new Date().toISOString();
      }
    } catch {
      // Tyst — heartbeat-fel hanteras av offline-detector via sin egen ping
    }
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.cfg.timeoutMs);
    try {
      return await fetch(url, { ...init, signal: ctrl.signal });
    } finally {
      clearTimeout(t);
    }
  }
}
