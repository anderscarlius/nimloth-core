import { describe, expect, it, vi, afterEach } from 'vitest';
import pino from 'pino';
import { OfflineDetector } from '../offline-detector.js';

const logger = pino({ level: 'silent' });

afterEach(() => {
  vi.restoreAllMocks();
});

function newDetector(intervalMs = 50, maxFailedPings = 3) {
  return new OfflineDetector(
    { centralUrl: 'http://does-not-matter', intervalMs, maxFailedPings, timeoutMs: 100 },
    logger,
  );
}

async function tick(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

describe('OfflineDetector', () => {
  it('startar i realtime och rapporterar 0 failed pings', () => {
    const d = newDetector();
    expect(d.getState().mode).toBe('realtime');
    expect(d.getState().failedPings).toBe(0);
  });

  it('går till offline efter maxFailedPings missade pings', async () => {
    const d = newDetector(20, 3);
    let offlineFired = false;
    d.on('offline', () => {
      offlineFired = true;
    });
    // Mocka fetch så det alltid kastar
    global.fetch = vi.fn().mockRejectedValue(new Error('network')) as unknown as typeof fetch;
    d.start();
    // Vänta tills 3+ pings hunnit missas
    await tick(150);
    d.stop();
    expect(d.getState().mode).toBe('offline');
    expect(offlineFired).toBe(true);
  });

  it('går tillbaka till realtime vid första lyckade ping efter offline', async () => {
    const d = newDetector(20, 3);
    let reconnected = false;
    d.on('reconnected', () => {
      reconnected = true;
    });
    let okFlag = false;
    global.fetch = vi.fn().mockImplementation(async () => {
      if (okFlag) return new Response('ok', { status: 200 });
      throw new Error('network');
    }) as unknown as typeof fetch;
    d.start();
    await tick(150); // bli offline
    expect(d.getState().mode).toBe('offline');
    okFlag = true;
    await tick(80); // en lyckad ping
    d.stop();
    expect(reconnected).toBe(true);
    expect(d.getState().mode).toBe('realtime');
  });
});
