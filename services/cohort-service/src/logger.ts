import pino from 'pino';

export function createLogger(level = 'info'): pino.Logger {
  return pino({
    level,
    base: { service: 'cohort-service' },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}
