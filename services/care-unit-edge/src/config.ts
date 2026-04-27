// Care-unit-edge konfiguration. Läses från env vid startup.

export interface CareUnitConfig {
  unitId: string;
  unitName: string;
  unitHsaId: string;
  /** SQLite-fil. Default i container: /data/care-unit.db. */
  dbPath: string;
  migrationsPath: string;
  central: {
    baseUrl: string;
    timeoutMs: number;
  };
  ports: {
    fhir: number;
    cds: number;
    status: number;
  };
  sync: {
    pushIntervalMs: number;
    pullIntervalMs: number;
    heartbeatIntervalMs: number;
    pushBatchSize: number;
  };
  offline: {
    /** Antal pings att missa innan offline */
    maxFailedPings: number;
    /** Hur ofta ping skickas (ms) */
    pingIntervalMs: number;
  };
  /** Patient-PNR att förladda vid hydrering. Komma-separerad. */
  listedPatients: string[];
  logLevel: string;
}

function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number(v);
  if (Number.isNaN(n)) throw new Error(`Env ${name} must be a number, got: ${v}`);
  return n;
}

function list(name: string, fallback: string[]): string[] {
  const v = process.env[name];
  if (!v) return fallback;
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function loadConfig(): CareUnitConfig {
  return {
    unitId: process.env.UNIT_ID ?? 'vc-dalsland-01',
    unitName: process.env.UNIT_NAME ?? 'Vårdcentralen Bengtsfors',
    unitHsaId: process.env.UNIT_HSA_ID ?? 'SE2321000131-E000000000999',
    dbPath: process.env.CARE_UNIT_DB ?? '/data/care-unit.db',
    migrationsPath: process.env.CARE_UNIT_MIGRATIONS ?? './migrations',
    central: {
      baseUrl: process.env.CENTRAL_URL ?? 'http://fhir-facade:3003',
      timeoutMs: num('CENTRAL_TIMEOUT_MS', 5_000),
    },
    ports: {
      fhir: num('CARE_UNIT_FHIR_PORT', 3003),
      cds: num('CARE_UNIT_CDS_PORT', 3004),
      status: num('CARE_UNIT_STATUS_PORT', 3006),
    },
    sync: {
      pushIntervalMs: num('SYNC_PUSH_INTERVAL_MS', 30_000),
      pullIntervalMs: num('SYNC_PULL_INTERVAL_MS', 30_000),
      heartbeatIntervalMs: num('SYNC_HEARTBEAT_INTERVAL_MS', 10_000),
      pushBatchSize: num('SYNC_PUSH_BATCH', 50),
    },
    offline: {
      maxFailedPings: num('OFFLINE_MAX_FAILED_PINGS', 3),
      pingIntervalMs: num('OFFLINE_PING_INTERVAL_MS', 10_000),
    },
    listedPatients: list('LISTED_PATIENTS', ['19500315-2384']),
    logLevel: process.env.LOG_LEVEL ?? 'info',
  };
}
