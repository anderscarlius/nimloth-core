import pino, { type Logger } from 'pino';

export function createLogger(level: string): Logger {
  return pino({
    level,
    base: { service: 'core-replication' },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}
