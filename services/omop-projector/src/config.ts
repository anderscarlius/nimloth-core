// Konfiguration för omop-projector. Läses från env med vettiga lokala defaults
// (core-db på CarliusFyra-LAN, EHRbase på 11401).

export interface ProjectorConfig {
  db: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
  };
  ehrbase: {
    baseUrl: string;
    timeoutMs: number;
  };
  transformVersion: string;
}

export function loadConfig(): ProjectorConfig {
  return {
    db: {
      host: process.env.OMOP_DB_HOST ?? '192.168.1.189',
      port: Number(process.env.OMOP_DB_PORT ?? 5435),
      database: process.env.OMOP_DB_NAME ?? 'core',
      user: process.env.OMOP_DB_USER ?? 'core',
      password: process.env.OMOP_DB_PASSWORD ?? 'core',
    },
    ehrbase: {
      baseUrl: process.env.EHRBASE_BASE_URL ?? 'http://192.168.1.189:11401/ehrbase',
      timeoutMs: Number(process.env.EHRBASE_REQUEST_TIMEOUT_MS ?? 30_000),
    },
    transformVersion: process.env.OMOP_TRANSFORM_VERSION ?? 'omop-projector@0.1.0',
  };
}
