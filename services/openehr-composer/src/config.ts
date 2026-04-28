// Konfig för openehr-composer. Följer mönster från services/audit/.

export interface ComposerConfig {
  port: number;
  ehrbase: { baseUrl: string };
  db: { host: string; port: number; database: string; user: string; password: string };
  /** Vilka templates composern förväntar sig finnas i EHRbase. Ifall någon
   *  saknas vid startup loggas det men tjänsten startar ändå (warn-mode). */
  expectedTemplateIds: string[];
  logLevel: string;
}

export function loadConfig(): ComposerConfig {
  return {
    port: Number(process.env.COMPOSER_PORT ?? process.env.PORT ?? 3015),
    ehrbase: {
      baseUrl: process.env.EHRBASE_URL ?? 'http://ehrbase:8080',
    },
    db: {
      host: process.env.CORE_DB_HOST ?? 'core-db',
      port: Number(process.env.CORE_DB_PORT ?? 5432),
      database: process.env.CORE_DB_NAME ?? 'core',
      user: process.env.CORE_DB_USER ?? 'core',
      password: process.env.CORE_DB_PASSWORD ?? 'core',
    },
    expectedTemplateIds: (process.env.EXPECTED_TEMPLATES ?? 'time_series.en.v1,minimal_action.en.v1')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    logLevel: process.env.LOG_LEVEL ?? 'info',
  };
}
