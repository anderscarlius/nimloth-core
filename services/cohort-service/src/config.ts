// Konfiguration för cohort-service.

// core-db på Moria är bara bunden till 127.0.0.1 (inte LAN-exponerad, till
// skillnad från det gamla CarliusFyra-läget) -- det finns alltså ingen
// enskild "rätt" default längre. Kräv env explicit hellre än att gissa fel
// tyst; se CLAUDE.md (nimloth-core-repot) för SSH-tunnel-mönstret.
function requireEnv(name: string, hint: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} saknas i miljön -- ${hint}`);
  return v;
}

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
  ehrbase: {
    baseUrl: string;
    timeoutMs: number;
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
      host: requireEnv(
        'OMOP_DB_HOST',
        "core-db på Moria är bara nåbar via 127.0.0.1 -- kör direkt på Moria eller öppna en SSH-tunnel ('ssh -L <lokal-port>:127.0.0.1:10435 nsf-moria') och sätt OMOP_DB_HOST=127.0.0.1 + OMOP_DB_PORT=<lokal-port>.",
      ),
      port: Number(
        requireEnv('OMOP_DB_PORT', 'se OMOP_DB_HOST-felmeddelandet -- ingen universell default finns längre.'),
      ),
      database: process.env.OMOP_DB_NAME ?? 'core',
      user: process.env.OMOP_DB_USER ?? 'core',
      password: process.env.OMOP_DB_PASSWORD ?? 'core',
    },
    http: {
      port: Number(process.env.COHORT_PORT ?? 3020),
      host: process.env.COHORT_HOST ?? '0.0.0.0',
    },
    ehrbase: {
      // I container default ehrbase via nimloth-core-nätet; utanför kör mot
      // Moria (EHRbase ÄR LAN-exponerad där, till skillnad från core-db ovan).
      baseUrl: process.env.EHRBASE_BASE_URL ?? 'http://192.168.1.220:11401/ehrbase',
      timeoutMs: Number(process.env.EHRBASE_REQUEST_TIMEOUT_MS ?? 15_000),
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
