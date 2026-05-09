// Env-baserad config för composition-mapper. Defaults håller dev-flöde
// fungerande utan extern infrastruktur (Kafka kan saknas — audit-publisher
// är lazy-connect per P4 4.1-beslut).

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * dataMode styr LLM-routing i composition-mapper:
 *   - 'phi' (default)       — riktig vårddata, sensitivity sätts till 'phi' i
 *                             model-router → on-premise hard-rule
 *   - 'synthetic' (demo)    — eval-data eller fixtures, sensitivity 'synthetic'
 *                             → cloud-routing tillåten
 *
 * Aktiveras via env `NIMLOTH_DATA_MODE=synthetic`. Default phi.
 * Ovalida värden tolkas som phi (belt-and-suspenders säkerhet).
 *
 * Se nimloth-docs/B22.5_Tier_Based_Sensitivity_Strategy.md.
 */
export type DataMode = 'phi' | 'synthetic';

export interface CompositionMapperConfig {
  port: number;
  logLevel: string;
  dbPath: string;
  migrationsPath: string;
  dataMode: DataMode;
  kafka: {
    brokers: string[];
    clientId: string;
    auditTopic: string;
    drainIntervalMs: number;
  };
}

export function loadConfig(): CompositionMapperConfig {
  const rawDataMode = process.env.NIMLOTH_DATA_MODE;
  const dataMode: DataMode = rawDataMode === 'synthetic' ? 'synthetic' : 'phi';

  return {
    port: Number(process.env.PORT ?? process.env.COMPOSITION_MAPPER_PORT ?? 3001),
    logLevel: process.env.LOG_LEVEL ?? 'info',
    dbPath: process.env.SQLITE_PATH ?? resolve(process.cwd(), 'data', 'composition-mapper.sqlite'),
    migrationsPath: resolve(__dirname, '..', 'migrations'),
    dataMode,
    kafka: {
      brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(',').map((s) => s.trim()),
      clientId: process.env.KAFKA_CLIENT_ID ?? 'core-composition-mapper',
      auditTopic: process.env.KAFKA_AUDIT_TOPIC ?? 'core.audit.access',
      drainIntervalMs: Number(process.env.AUDIT_DRAIN_INTERVAL_MS ?? 5000),
    },
  };
}
