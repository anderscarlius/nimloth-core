// Retry-with-backoff runt migrate() — kraschloop-triagens alternativ 3
// (2026-08-18/19). Mockar pool.query för att kasta N gånger innan den
// lyckas, verifierar att migrate() ändå slutförs, och att den ger upp
// efter retries-taket.

import { describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import type { Logger } from 'pino';
import { migrate } from '../db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../migrations');

function makeSilentLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as Logger;
}

function buildFailThenSucceedPool(failCount: number): pg.Pool {
  let calls = 0;
  return {
    query: async () => {
      calls += 1;
      if (calls <= failCount) {
        throw new Error('ECONNREFUSED — core-db not ready yet');
      }
      return { rows: [] };
    },
  } as unknown as pg.Pool;
}

describe('migrate — retry-with-backoff', () => {
  it('lyckas efter transienta fel inom retries-taket', async () => {
    const pool = buildFailThenSucceedPool(3);
    const logger = makeSilentLogger();

    await expect(
      migrate(pool, MIGRATIONS_DIR, logger, { retries: 5, initialDelayMs: 1, maxDelayMs: 2 }),
    ).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledTimes(3);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('ger upp och kastar efter att retries-taket passerats', async () => {
    const pool = buildFailThenSucceedPool(10);
    const logger = makeSilentLogger();

    await expect(
      migrate(pool, MIGRATIONS_DIR, logger, { retries: 2, initialDelayMs: 1, maxDelayMs: 2 }),
    ).rejects.toThrow(/ECONNREFUSED/);

    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('kör bara en gång vid direkt lyckat anrop (ingen onödig fördröjning)', async () => {
    const pool = buildFailThenSucceedPool(0);
    const logger = makeSilentLogger();

    await migrate(pool, MIGRATIONS_DIR, logger, { retries: 5, initialDelayMs: 1, maxDelayMs: 2 });

    expect(logger.warn).not.toHaveBeenCalled();
  });
});
