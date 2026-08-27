// Gateway audit-publisher — samma mönster som
// services/openehr-composer/src/bridge/bridge-audit.ts (P3.0b), anpassat
// för gatewayens egna händelser. Egen fil, inte en delad import: services
// i denna kodbas håller sina audit-publishers självständiga (fhir-facade
// har sin egen middleware/audit.ts, cohort-service delar inte med
// fhir-facade heller).
//
// S5/I3: routingändringar auditeras alltid, oavsett om Kafka är
// tillgängligt — vid frånkopplat Kafka faller det tillbaka till
// pino-logg, aldrig till tystnad.

import { randomUUID } from "node:crypto";
import { Kafka, type Producer } from "kafkajs";
import type { Logger } from "pino";

export type GatewayAuditAction =
  | "ROUTING_CHANGED"
  | "SHADOW_WRITE_SUCCESS"
  | "SHADOW_WRITE_FAILED"
  | "REVERSE_SHADOW_WRITE_SUCCESS"
  | "REVERSE_SHADOW_WRITE_FAILED";

export interface GatewayAuditEvent {
  event_id: string;
  timestamp: string;
  actor: { hsa_id: string; role: string };
  action: GatewayAuditAction;
  resource_type: "RoutingConfig" | "Note";
  resource_id: string;
  patient_id: string | null;
  canonical_store: "legacy" | "openehr" | null;
  outcome: "SUCCESS" | "ERROR";
  details: Record<string, unknown>;
}

export interface GatewayAuditConfig {
  brokers: string[];
  clientId: string;
  topic: string;
}

export function isKafkaDisabled(brokers: string[]): boolean {
  if (brokers.length === 0) return true;
  const first = (brokers[0] ?? "").trim().toLowerCase();
  return first === "" || first === "disabled";
}

export interface GatewayAuditEmitOpts {
  resourceType: GatewayAuditEvent["resource_type"];
  resourceId: string;
  actorHsaId?: string;
  patientId?: string | null;
  canonicalStore?: "legacy" | "openehr" | null;
  outcome?: "SUCCESS" | "ERROR";
  details?: Record<string, unknown>;
}

export interface GatewayAuditPublisher {
  emit(action: GatewayAuditAction, opts: GatewayAuditEmitOpts): Promise<void>;
  stop(): Promise<void>;
}

function inferOutcome(action: GatewayAuditAction): "SUCCESS" | "ERROR" {
  return action === "SHADOW_WRITE_FAILED" || action === "REVERSE_SHADOW_WRITE_FAILED" ? "ERROR" : "SUCCESS";
}

export function buildGatewayAuditEvent(
  action: GatewayAuditAction,
  opts: GatewayAuditEmitOpts,
): GatewayAuditEvent {
  return {
    event_id: randomUUID(),
    timestamp: new Date().toISOString(),
    actor: { hsa_id: opts.actorHsaId ?? "system:migration-gateway", role: "system" },
    action,
    resource_type: opts.resourceType,
    resource_id: opts.resourceId,
    patient_id: opts.patientId ?? null,
    canonical_store: opts.canonicalStore ?? null,
    outcome: opts.outcome ?? inferOutcome(action),
    details: opts.details ?? {},
  };
}

class KafkaGatewayAuditPublisher implements GatewayAuditPublisher {
  private kafka: Kafka | null = null;
  private producer: Producer | null = null;
  private connected = false;

  constructor(
    private readonly cfg: GatewayAuditConfig,
    private readonly logger: Logger,
  ) {}

  private ensureProducer(): Producer {
    if (this.producer) return this.producer;
    this.kafka = new Kafka({
      clientId: this.cfg.clientId,
      brokers: this.cfg.brokers,
      retry: { retries: 3, initialRetryTime: 300 },
    });
    this.producer = this.kafka.producer({ idempotent: true });
    return this.producer;
  }

  async emit(action: GatewayAuditAction, opts: GatewayAuditEmitOpts): Promise<void> {
    const event = buildGatewayAuditEvent(action, opts);
    try {
      const producer = this.ensureProducer();
      if (!this.connected) {
        await producer.connect();
        this.connected = true;
      }
      await producer.send({
        topic: this.cfg.topic,
        messages: [{ key: event.resource_id, value: JSON.stringify(event) }],
      });
    } catch (err) {
      this.logger.warn(
        { err: String(err), action, event },
        "gateway audit Kafka publish failed — falling back to log-only",
      );
    }
  }

  async stop(): Promise<void> {
    if (this.connected && this.producer) {
      await this.producer.disconnect().catch(() => undefined);
      this.connected = false;
    }
  }
}

class NoopGatewayAuditPublisher implements GatewayAuditPublisher {
  constructor(private readonly logger: Logger) {}

  async emit(action: GatewayAuditAction, opts: GatewayAuditEmitOpts): Promise<void> {
    const event = buildGatewayAuditEvent(action, opts);
    this.logger.info({ audit: event }, "gateway audit (Kafka disabled — log-only)");
  }

  async stop(): Promise<void> {
    // no-op
  }
}

export function createGatewayAuditPublisher(
  cfg: GatewayAuditConfig,
  logger: Logger,
): GatewayAuditPublisher {
  if (isKafkaDisabled(cfg.brokers)) {
    logger.warn({ brokers: cfg.brokers }, "gateway audit publisher: KAFKA_BROKERS disabled/empty — events will log only");
    return new NoopGatewayAuditPublisher(logger);
  }
  return new KafkaGatewayAuditPublisher(cfg, logger);
}
