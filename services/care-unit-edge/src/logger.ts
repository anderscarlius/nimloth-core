import pino from 'pino';

export function createLogger(level: string, unitId: string) {
  return pino({
    level,
    base: { service: 'care-unit-edge', unit_id: unitId },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}
