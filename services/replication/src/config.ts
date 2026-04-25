// Replication-tjänstens konfiguration — läses från env vid startup.

export interface ReplicationConfig {
  port: number;
  logLevel: string;
  kafka: {
    brokers: string[];
    clientId: string;
  };
  db: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
  };
  edgeInstances: string[];
  /** Centrala domäntopics som aggregatorn ska spegla från edge-prefixade varianter. */
  aggregatedTopics: string[];
  patientIndex: {
    fullSyncIntervalMs: number;
    batchSize: number;
  };
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
  return v.split(',').map((s) => s.trim()).filter(Boolean);
}

export function loadConfig(): ReplicationConfig {
  return {
    port: num('REPLICATION_PORT', 3007),
    logLevel: process.env.LOG_LEVEL ?? 'info',
    kafka: {
      brokers: list('KAFKA_BROKERS', ['kafka:29092']),
      clientId: process.env.KAFKA_CLIENT_ID ?? 'core-replication',
    },
    db: {
      host: process.env.CORE_DB_HOST ?? 'core-db',
      port: num('CORE_DB_PORT', 5432),
      database: process.env.CORE_DB_NAME ?? 'core',
      user: process.env.CORE_DB_USER ?? 'core',
      password: process.env.CORE_DB_PASSWORD ?? 'core',
    },
    edgeInstances: list('EDGE_INSTANCES', ['su']),
    aggregatedTopics: list('AGGREGATED_TOPICS', [
      'core.clinical.observation.vitals',
      'core.clinical.lab.result',
      'core.clinical.medication.prescribed',
      'core.clinical.medication.dispensed',
      'core.clinical.procedure.completed',
      'core.clinical.encounter.started',
      'core.clinical.encounter.ended',
      'core.clinical.note.signed',
      'core.clinical.condition.diagnosed',
      'core.clinical.allergy.reported',
      'core.audit.access',
    ]),
    patientIndex: {
      fullSyncIntervalMs: num('PATIENT_INDEX_SYNC_INTERVAL_MS', 300_000),
      batchSize: num('PATIENT_INDEX_BATCH_SIZE', 500),
    },
  };
}
