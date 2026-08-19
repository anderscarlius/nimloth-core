export interface ServiceConfig {
  port: number;
  ehrbaseBaseUrl: string;
  logLevel: string;
  // Compose Etapp 1 — tjänsten anropades hittills bara server-till-server
  // (med-review-core m.fl.), aldrig direkt från en webbläsare. Studios
  // riktiga AQL-facade (RealAqlTemplateService) kör i webbläsaren och
  // behöver CORS. Tomt/ounsatt = ingen CORS-header alls (identiskt med
  // tidigare beteende) — måste sättas explicit, ändrar inget i Moria-driften.
  corsAllowedOrigins: string[];
}

export function loadConfig(): ServiceConfig {
  return {
    port: Number(process.env.PORT ?? 3010),
    ehrbaseBaseUrl: process.env.EHRBASE_BASE_URL ?? "http://192.168.1.189:11401/ehrbase",
    logLevel: process.env.LOG_LEVEL ?? "info",
    corsAllowedOrigins: (process.env.CORS_ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  };
}
