// Retry-wrapper for Kafka consumer/materializer startup.
//
// Background (B14, 2026-05-23): On cold-start, the KRaft broker's
// consumer-group coordinator can take 10-30 seconds to initialize the
// internal __consumer_offsets topic. Consumers that try to join during
// that window fail with COORDINATOR_NOT_AVAILABLE or
// UnknownTopicOrPartition. The errors are retriable but KafkaJS's
// in-cluster retry sometimes exhausts before the coordinator is ready.
//
// This helper wraps a startup function and retries on the known transient
// errors with exponential backoff. Default: 6 attempts, ~31s total wait.

// Minimal logger interface — accepts pino logger or any structured logger
// with a .warn(obj, msg) signature. Decoupled to keep kafka-utils dependency-light.
export interface RetryLogger {
  warn(obj: Record<string, unknown>, msg?: string): void;
  child?: (bindings: Record<string, unknown>) => RetryLogger;
}

const TRANSIENT_KAFKA_ERROR_PATTERNS = [
  'COORDINATOR_NOT_AVAILABLE',
  'coordinator is not available',
  'UnknownTopicOrPartition',
  'does not host this topic-partition',
  'NotCoordinatorForGroup',
  'GroupLoadInProgress',
];

function isTransientKafkaError(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err);
  return TRANSIENT_KAFKA_ERROR_PATTERNS.some((p) => msg.includes(p));
}

export interface StartWithRetryOptions {
  attempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  logger?: RetryLogger;
  label?: string;
}

export async function startWithKafkaRetry(
  start: () => Promise<void>,
  opts: StartWithRetryOptions = {},
): Promise<void> {
  const attempts = opts.attempts ?? 6;
  const initialDelay = opts.initialDelayMs ?? 1000;
  const maxDelay = opts.maxDelayMs ?? 15_000;
  const label = opts.label ?? 'kafka start';

  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await start();
      return;
    } catch (err) {
      lastErr = err;
      if (!isTransientKafkaError(err) || attempt === attempts) {
        throw err;
      }
      const delay = Math.min(initialDelay * 2 ** (attempt - 1), maxDelay);
      opts.logger?.warn(
        { err: String(err), attempt, attempts, delayMs: delay },
        `${label}: transient Kafka error, retrying after ${delay}ms`,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr ?? new Error(`${label}: retry exhausted`);
}
