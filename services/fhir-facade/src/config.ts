// FHIR Facade-konfiguration.

export type FhirMode = 'primary' | 'replica';

export interface FhirFacadeConfig {
  instanceId: string;
  mode: FhirMode;
  port: number;
  kafka: {
    brokers: string[];
    clientId: string;
    groupId: string;
  };
  db: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
  };
  replicaSqlitePath?: string; // Fylls i Prompt 13 (edge-mode)
  logLevel: string;
  /** Topics som materializern konsumerar för att populera FHIR-tabellerna. */
  clinicalTopics: string[];
}

export function loadConfig(): FhirFacadeConfig {
  const instanceId = process.env.MELIOR_INSTANCE_ID ?? process.env.EDGE_INSTANCE_ID ?? 'su';
  const mode = (process.env.FHIR_MODE ?? 'primary') as FhirMode;

  return {
    instanceId,
    mode,
    port: Number(process.env.FHIR_FACADE_PORT ?? process.env.PORT ?? 3003),
    kafka: {
      brokers: (process.env.KAFKA_BROKERS ?? 'kafka:29092').split(',').map((s) => s.trim()),
      clientId: process.env.KAFKA_CLIENT_ID ?? 'core-fhir-facade',
      groupId: process.env.KAFKA_GROUP_ID ?? 'core-fhir-materializer',
    },
    db: {
      host: process.env.CORE_DB_HOST ?? 'core-db',
      port: Number(process.env.CORE_DB_PORT ?? 5432),
      database: process.env.CORE_DB_NAME ?? 'core',
      user: process.env.CORE_DB_USER ?? 'core',
      password: process.env.CORE_DB_PASSWORD ?? 'core',
    },
    replicaSqlitePath: process.env.FHIR_CACHE_DB,
    logLevel: process.env.LOG_LEVEL ?? 'info',
    clinicalTopics: (
      process.env.CLINICAL_TOPICS ??
      [
        'core.clinical.observation.vitals',
        'core.clinical.lab.result',
        'core.clinical.medication.prescribed',
        'core.clinical.procedure.completed',
        'core.clinical.encounter.started',
        'core.clinical.encounter.ended',
        'core.clinical.condition.diagnosed',
        'core.clinical.allergy.reported',
      ].join(',')
    )
      .split(',')
      .map((s) => s.trim()),
  };
}
