// Mapping-assistant konfiguration. Läses från env vid startup.
//
// Designad för distribuerad drift: kan köras isolerat med bara SQLite + lokal
// Ollama. Kafka-anslutning är optional — saknas brokers, lagras audit-events
// i outbox och drainas när Kafka kommer upp igen.

export interface MappingAssistantConfig {
  port: number;
  logLevel: string;
  dbPath: string;
  migrationsPath: string;
  promptsPath: string;
  routingConfigPath: string;
  /** Lägg utkast-mappers här. transform/src/mappings/proposed/. Default: ../transform/src/mappings/proposed. */
  proposedMappersPath: string;
  kafka: {
    /** Tom array eller tom sträng = audit-publishing inaktiverad (events stannar i outbox). */
    brokers: string[];
    clientId: string;
    /** Topic att publicera audit-events till. */
    auditTopic: string;
    /** Hur ofta outbox drainas. */
    drainIntervalMs: number;
  };
  /** När true: vägrar starta om template-manifest inte matchar filsystemet. När false: loggar varning. */
  requireValidPrompts: boolean;
}

function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number(v);
  if (Number.isNaN(n)) throw new Error(`Env ${name} must be a number, got: ${v}`);
  return n;
}

function bool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (!v) return fallback;
  return v === '1' || v.toLowerCase() === 'true';
}

function list(name: string, fallback: string[]): string[] {
  const v = process.env[name];
  if (v == null) return fallback;
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function loadConfig(): MappingAssistantConfig {
  return {
    port: num('MAPPING_ASSISTANT_PORT', 3009),
    logLevel: process.env.LOG_LEVEL ?? 'info',
    dbPath: process.env.MAPPING_ASSISTANT_DB ?? '/data/mapping-assistant.db',
    migrationsPath: process.env.MAPPING_ASSISTANT_MIGRATIONS ?? './migrations',
    promptsPath: process.env.MAPPING_ASSISTANT_PROMPTS ?? './prompts',
    routingConfigPath:
      process.env.MODEL_ROUTING_CONFIG ?? '/app/config/model-routing.yaml',
    proposedMappersPath:
      process.env.PROPOSED_MAPPERS_PATH ?? '/app/services/transform/src/mappings/proposed',
    kafka: {
      brokers: list('KAFKA_BROKERS', ['kafka:29092']),
      clientId: process.env.KAFKA_CLIENT_ID ?? 'core-mapping-assistant',
      auditTopic: process.env.MAPPING_AUDIT_TOPIC ?? 'core.audit.mapping',
      drainIntervalMs: num('AUDIT_DRAIN_INTERVAL_MS', 10_000),
    },
    requireValidPrompts: bool('REQUIRE_VALID_PROMPTS', true),
  };
}
