// FHIR Facade-konfiguration.

export type FhirMode = 'primary' | 'replica';
export type CanonicalStoreMode = 'postgres' | 'openehr' | 'both';

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
  /** Sprint 2 P3.3: vilken canonical store används för read-anrop.
   *  postgres (default) = oförändrat beteende från P3.0–P3.2.
   *  openehr = AQL-broker används istället.
   *  both = postgres primär + openehr sekundär (förbereder P3.4 paritetsdiff). */
  canonicalStore: CanonicalStoreMode;
  /** EHRbase REST-endpoint (för openehr-store). */
  ehrbaseUrl: string;
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
    canonicalStore: ((): CanonicalStoreMode => {
      const v = (process.env.CANONICAL_STORE ?? 'postgres').toLowerCase();
      if (v === 'postgres' || v === 'openehr' || v === 'both') return v;
      // eslint-disable-next-line no-console
      console.warn(`Invalid CANONICAL_STORE=${v}, defaulting to postgres`);
      return 'postgres';
    })(),
    ehrbaseUrl: process.env.EHRBASE_URL ?? 'http://ehrbase:8080',
  };
}
