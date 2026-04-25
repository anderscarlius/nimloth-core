import pino from 'pino';

export function createLogger(level: string): pino.Logger {
  return pino({
    level,
    base: { service: 'cds-hooks' },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}
