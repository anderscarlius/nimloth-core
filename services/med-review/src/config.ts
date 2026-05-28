export interface ServiceConfig {
  port: number;
  /** aql-template-service bas-URL (Kontrakt 1). Co-located på cf4. */
  aqlTemplateBaseUrl: string;
  logLevel: string;
}

export function loadConfig(): ServiceConfig {
  return {
    port: Number(process.env.PORT ?? 3011),
    aqlTemplateBaseUrl:
      process.env.AQL_TEMPLATE_BASE_URL ?? "http://192.168.1.189:11402",
    logLevel: process.env.LOG_LEVEL ?? "info",
  };
}
