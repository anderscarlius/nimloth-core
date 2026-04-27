import pino from 'pino';

export function createLogger(level: string): pino.Logger {
  return pino({
    level,
    base: { service: 'mapping-assistant' },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}
