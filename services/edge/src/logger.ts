import pino from 'pino';

export function createLogger(level: string, instanceId: string): pino.Logger {
  return pino({
    level,
    base: { service: 'core-edge', instance_id: instanceId },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}
