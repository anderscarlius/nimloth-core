// Konfiguration för omop-projector. Läses från env.
//
// core-db på Moria är bara bunden till 127.0.0.1 (inte LAN-exponerad, till
// skillnad från det gamla CarliusFyra-läget) -- det finns alltså ingen
// enskild "rätt" default för DB-anslutningen längre. Kräv env explicit
// hellre än att gissa fel tyst; se CLAUDE.md för SSH-tunnel-mönstret.
function requireEnv(name: string, hint: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} saknas i miljön -- ${hint}`);
  return v;
}

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
    ehrbase: {
      // EHRbase ÄR LAN-exponerad på Moria (till skillnad från core-db ovan).
      baseUrl: process.env.EHRBASE_BASE_URL ?? 'http://192.168.1.220:11401/ehrbase',
      timeoutMs: Number(process.env.EHRBASE_REQUEST_TIMEOUT_MS ?? 30_000),
    },
    transformVersion: process.env.OMOP_TRANSFORM_VERSION ?? 'omop-projector@0.1.0',
  };
}
