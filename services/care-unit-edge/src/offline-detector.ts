// OfflineDetector — pollar central FHIR-facade och avgör om vi är online.
// State-machine:
//   realtime → degraded (1-2 missade pings) → offline (≥3 missade)
//   offline → reconnecting → realtime (efter första lyckade ping)

import { EventEmitter } from 'node:events';
import type { Logger } from 'pino';

export type OfflineMode = 'realtime' | 'degraded' | 'offline' | 'reconnecting';

export interface OfflineState {
  mode: OfflineMode;
  failedPings: number;
  lastPingAt: string | null;
  lastSuccessAt: string | null;
}

export class OfflineDetector extends EventEmitter {
  private state: OfflineState = {
    mode: 'realtime',
    failedPings: 0,
    lastPingAt: null,
    lastSuccessAt: null,
  };
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly cfg: { centralUrl: string; intervalMs: number; maxFailedPings: number; timeoutMs: number },
    private readonly logger: Logger,
  ) {
    super();
  }

  start(): void {
    if (this.timer) return;
    // Kör direkt + sedan periodiskt
    void this.ping();
    this.timer = setInterval(() => void this.ping(), this.cfg.intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  getState(): OfflineState {
    return { ...this.state };
  }

  private async ping(): Promise<void> {
    const url = `${this.cfg.centralUrl.replace(/\/$/, '')}/health`;
    this.state.lastPingAt = new Date().toISOString();
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), this.cfg.timeoutMs);
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.markSuccess();
    } catch (err) {
      this.markFailure(err);
    }
  }

  private markSuccess(): void {
    const wasOffline = this.state.mode === 'offline' || this.state.mode === 'reconnecting';
    this.state.failedPings = 0;
    this.state.lastSuccessAt = new Date().toISOString();
    if (wasOffline) {
      this.transition('realtime');
      this.emit('reconnected');
    } else if (this.state.mode !== 'realtime') {
      this.transition('realtime');
    }
  }

  private markFailure(err: unknown): void {
    this.state.failedPings++;
    this.logger.debug({ err: String(err), failed: this.state.failedPings }, 'central ping failed');
    if (this.state.failedPings >= this.cfg.maxFailedPings && this.state.mode !== 'offline') {
      this.transition('offline');
      this.emit('offline');
    } else if (this.state.failedPings > 0 && this.state.mode === 'realtime') {
      this.transition('degraded');
    }
  }

  private transition(next: OfflineMode): void {
    if (this.state.mode === next) return;
    this.logger.info({ from: this.state.mode, to: next }, 'offline-detector transition');
    this.state.mode = next;
  }
}
