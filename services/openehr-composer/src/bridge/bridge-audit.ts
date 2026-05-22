// Bridge audit-publisher for P3.0b template-loading events.
//
// Emits BRIDGE_COMPILE / BRIDGE_RELOAD / BRIDGE_VALIDATE_FAIL on the
// core.audit.access Kafka topic. System-event category — nullable PDL
// fields per P3.4 PARITY_RUN precedent.
//
// Graceful degradation: when KAFKA_BROKERS is empty/'disabled' or the
// broker is unreachable, events fall back to pino warn-log. Bridge
// template-loading still succeeds — audit is observability, not
// gate-blocking.

import { randomUUID } from "node:crypto";
import { Kafka, type Producer } from "kafkajs";
import type { Logger } from "pino";

export type BridgeAuditAction =
  | "BRIDGE_COMPILE"
  | "BRIDGE_RELOAD"
  | "BRIDGE_VALIDATE_FAIL";

export interface BridgeAuditEvent {
  event_id: string;
  timestamp: string;
  actor: { hsa_id: string; role: "system" };
  action: BridgeAuditAction;
  resource_type: "OperationalTemplate";
  resource_id: string;
  patient_id: null;
  outcome: "SUCCESS" | "ERROR";
  details: Record<string, unknown>;
}

export interface BridgeAuditConfig {
  brokers: string[];
  clientId: string;
  topic: string;
}

export function isKafkaDisabled(brokers: string[]): boolean {
  if (brokers.length === 0) return true;
  const first = (brokers[0] ?? "").trim().toLowerCase();
  return first === "" || first === "disabled";
}

export interface BridgeAuditPublisher {
  emit(action: BridgeAuditAction, opts: {
    templateId: string;
    outcome?: "SUCCESS" | "ERROR";
    details?: Record<string, unknown>;
  }): Promise<void>;
  stop(): Promise<void>;
}

export function buildAuditEvent(
  action: BridgeAuditAction,
  templateId: string,
  outcome: "SUCCESS" | "ERROR",
  details: Record<string, unknown>,
): BridgeAuditEvent {
  return {
    event_id: randomUUID(),
    timestamp: new Date().toISOString(),
    actor: { hsa_id: "system:bridge-compiler", role: "system" },
    action,
    resource_type: "OperationalTemplate",
    resource_id: templateId,
    patient_id: null,
    outcome,
    details,
  };
}

function inferOutcome(action: BridgeAuditAction): "SUCCESS" | "ERROR" {
  return action === "BRIDGE_VALIDATE_FAIL" ? "ERROR" : "SUCCESS";
}

class KafkaBridgeAuditPublisher implements BridgeAuditPublisher {
  private kafka: Kafka | null = null;
  private producer: Producer | null = null;
  private connected = false;

  constructor(
    private readonly cfg: BridgeAuditConfig,
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

  async emit(
    action: BridgeAuditAction,
    opts: {
      templateId: string;
      outcome?: "SUCCESS" | "ERROR";
      details?: Record<string, unknown>;
    },
  ): Promise<void> {
    const event = buildAuditEvent(
      action,
      opts.templateId,
      opts.outcome ?? inferOutcome(action),
      opts.details ?? {},
    );

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
      this.logger.debug({ action, templateId: opts.templateId }, "bridge audit emitted");
    } catch (err) {
      this.logger.warn(
        { err: String(err), action, templateId: opts.templateId, event },
        "bridge audit Kafka publish failed — falling back to log-only",
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

class NoopBridgeAuditPublisher implements BridgeAuditPublisher {
  constructor(private readonly logger: Logger) {}

  async emit(
    action: BridgeAuditAction,
    opts: {
      templateId: string;
      outcome?: "SUCCESS" | "ERROR";
      details?: Record<string, unknown>;
    },
  ): Promise<void> {
    const event = buildAuditEvent(
      action,
      opts.templateId,
      opts.outcome ?? inferOutcome(action),
      opts.details ?? {},
    );
    this.logger.info(
      { audit: event },
      "bridge audit (Kafka disabled — log-only)",
    );
  }

  async stop(): Promise<void> {
    // no-op
  }
}

export function createBridgeAuditPublisher(
  cfg: BridgeAuditConfig,
  logger: Logger,
): BridgeAuditPublisher {
  if (isKafkaDisabled(cfg.brokers)) {
    logger.warn(
      { brokers: cfg.brokers },
      "bridge audit publisher: KAFKA_BROKERS disabled/empty — events will log only",
    );
    return new NoopBridgeAuditPublisher(logger);
  }
  return new KafkaBridgeAuditPublisher(cfg, logger);
}
