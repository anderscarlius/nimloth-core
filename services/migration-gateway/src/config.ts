export interface GatewayConfig {
  port: number;
  db: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
  };
  legacySimBaseUrl: string;
  ehrbaseBaseUrl: string;
  kafkaBrokers: string[];
  kafkaAuditTopic: string;
}

export function loadConfig(): GatewayConfig {
  return {
    port: Number(process.env.PORT ?? 11113),
    db: {
      host: process.env.PGHOST ?? "localhost",
      port: Number(process.env.PGPORT ?? 5432),
      database: process.env.PGDATABASE ?? "core",
      user: process.env.PGUSER ?? "core",
      password: process.env.PGPASSWORD ?? "core",
    },
    legacySimBaseUrl: process.env.LEGACY_SIM_BASE_URL ?? "http://localhost:11601",
    ehrbaseBaseUrl: process.env.EHRBASE_BASE_URL ?? "http://localhost:11401/ehrbase",
    kafkaBrokers: (process.env.KAFKA_BROKERS ?? "disabled")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    kafkaAuditTopic: process.env.KAFKA_AUDIT_TOPIC ?? "core.audit.access",
  };
}
