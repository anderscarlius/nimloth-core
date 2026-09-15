export interface ServiceConfig {
  port: number;
  /** aql-template-service bas-URL (Kontrakt 1). Live på Moria (11402). */
  aqlTemplateBaseUrl: string;
  logLevel: string;
}

export function loadConfig(): ServiceConfig {
  return {
    port: Number(process.env.PORT ?? 3011),
    aqlTemplateBaseUrl:
      process.env.AQL_TEMPLATE_BASE_URL ?? "http://192.168.1.220:11402",
    logLevel: process.env.LOG_LEVEL ?? "info",
  };
}
