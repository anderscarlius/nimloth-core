// Konfiguration för cohort-service.

export interface CohortConfig {
  db: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
  };
  http: {
    port: number;
    host: string;
  };
  bulk: {
    /** Antal preloaded personer som ska genereras. */
    size: number;
    /** Startvärde för person_id-rymd (default 1_000_000, > Del 1 live-rymd). */
    personIdOffset: number;
    /** Master-seed för deterministisk syntetisering. */
    seed: string;
    /** Datumsfönster för events. */
    dateFrom: string;
    dateTo: string;
  };
}

export function loadConfig(): CohortConfig {
  return {
    db: {
      host: process.env.OMOP_DB_HOST ?? '192.168.1.189',
      port: Number(process.env.OMOP_DB_PORT ?? 5435),
      database: process.env.OMOP_DB_NAME ?? 'core',
      user: process.env.OMOP_DB_USER ?? 'core',
      password: process.env.OMOP_DB_PASSWORD ?? 'core',
    },
    http: {
      port: Number(process.env.COHORT_PORT ?? 3020),
      host: process.env.COHORT_HOST ?? '0.0.0.0',
    },
    bulk: {
      size: Number(process.env.COHORT_BULK_SIZE ?? 20_000),
      personIdOffset: Number(process.env.COHORT_PERSON_ID_OFFSET ?? 1_000_000),
      seed: process.env.COHORT_BULK_SEED ?? 'nimloth-ku-del2',
      dateFrom: process.env.COHORT_BULK_DATE_FROM ?? '2020-01-01',
      dateTo: process.env.COHORT_BULK_DATE_TO ?? '2025-12-31',
    },
  };
}
