// Nätverksövervakare — pingar central hub med konfigurerbar interval/timeout.
// Emittar 'online', 'offline', 'reconnected'. Använder Node:s inbyggda fetch + AbortController.

import { EventEmitter } from 'node:events';
import type { Logger } from 'pino';

export interface OfflineDetectorConfig {
  centralHealthUrl: string;
  pingIntervalMs: number;
  pingTimeoutMs: number;
  maxRetries: number;
}

export interface OfflineDetectorStatus {
  online: boolean;
  missedPings: number;
  lastCheck: Date | null;
  lastError: string | null;
}

type Events = {
  online: [];
  offline: [];
  reconnected: [];
};

export class OfflineDetector extends EventEmitter {
  private isOnline = true;
  private missedPings = 0;
  private lastCheck: Date | null = null;
  private lastError: string | null = null;
  private intervalHandle: NodeJS.Timeout | null = null;

  constructor(
    private readonly config: OfflineDetectorConfig,
    private readonly logger: Logger,
  ) {
    super();
  }

  override on<K extends keyof Events>(event: K, listener: (...args: Events[K]) => void): this {
    return super.on(event, listener as (...args: unknown[]) => void);
  }

  override emit<K extends keyof Events>(event: K, ...args: Events[K]): boolean {
    return super.emit(event, ...args);
  }

  start(): void {
    if (this.intervalHandle) return;
    this.intervalHandle = setInterval(() => void this.ping(), this.config.pingIntervalMs);
    void this.ping(); // Omedelbar första ping
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  getStatus(): OfflineDetectorStatus {
    return {
      online: this.isOnline,
      missedPings: this.missedPings,
      lastCheck: this.lastCheck,
      lastError: this.lastError,
    };
  }

  /** Exponeras för tester — simulera nätavbrott utan att behöva en verklig network-host. */
  forceOffline(): void {
    if (this.isOnline) {
      this.isOnline = false;
      this.emit('offline');
    }
  }

  async ping(): Promise<void> {
    this.lastCheck = new Date();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.pingTimeoutMs);
    try {
      const res = await fetch(this.config.centralHealthUrl, {
        signal: controller.signal,
      });
      if (res.ok) {
        this.handleSuccess();
      } else {
        this.handleFailure(`status ${res.status}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.handleFailure(msg);
    } finally {
      clearTimeout(timeout);
    }
  }

  private handleSuccess(): void {
    this.lastError = null;
    if (!this.isOnline) {
      this.isOnline = true;
      this.missedPings = 0;
      this.logger.info('central hub reconnected');
      this.emit('reconnected');
      this.emit('online');
      return;
    }
    if (this.missedPings > 0) {
      this.logger.debug({ priorMissedPings: this.missedPings }, 'ping recovered before offline');
    }
    this.missedPings = 0;
  }

  private handleFailure(reason: string): void {
    this.lastError = reason;
    this.missedPings++;
    this.logger.debug({ missedPings: this.missedPings, reason }, 'ping failed');
    if (this.missedPings >= this.config.maxRetries && this.isOnline) {
      this.isOnline = false;
      this.logger.warn(
        { missedPings: this.missedPings, reason },
        'central hub unreachable — switching to offline mode',
      );
      this.emit('offline');
    }
  }
}
