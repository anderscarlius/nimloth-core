export interface ServiceConfig {
  port: number;
  ehrbaseBaseUrl: string;
  logLevel: string;
}

export function loadConfig(): ServiceConfig {
  return {
    port: Number(process.env.PORT ?? 3010),
    ehrbaseBaseUrl: process.env.EHRBASE_BASE_URL ?? "http://192.168.1.189:11401/ehrbase",
    logLevel: process.env.LOG_LEVEL ?? "info",
  };
}
