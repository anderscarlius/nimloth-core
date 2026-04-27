// Asker-flödet (Sprint 2, P4 Fas 4.2):
//
//   Transform [confidence=low]
//     → publicerar core.system.mapping.pending
//   Asker-konsument [mapping-assistant]
//     → enqueue:r i asker_pending (SQLite)
//   Periodisk asker-loop:
//     → läser pending-jobb
//     → anropar model-router (mapping.ask, sensitivity=phi)
//     → routern tvingar on-premise (Ollama eller mock-fallback)
//     → tolkar JSON-svar (decision, rationale, patch)
//     → markerar status=answered/escalated
//
// PHI-flödet är medvetet pessimistiskt:
//   - Om Ollama inte är konfigurerad → routing-regel faller till mock
//     vars enda svar är "escalate" (mänsklig granskning).
//   - Audit-event publiceras alltid med providerId så vi kan se hur ofta
//     vi hamnar i mock-escalate-sticken.

import { Kafka, type Consumer } from 'kafkajs';
import type { Logger } from 'pino';
import type { ModelRouter } from '@nimloth-core/model-router';
import type { MappingAssistantDb } from './db.js';
import type { VerifiedTemplate } from './prompt-store.js';
import { fillTemplate } from './prompt-store.js';

export interface MappingPendingEvent {
  event_id: string;
  source_system: string;
  source_table: string;
  mapper_name: string;
  raw_event: Record<string, unknown>;
  confidence?: 'low' | 'medium' | 'high';
}

export interface AskerConfig {
  brokers: string[];
  clientId: string;
  groupId: string;
  topic: string;
  pollIntervalMs: number;
  /** Hur många pending-jobb hämtas per loop. */
  batchSize: number;
}

export interface AskerDecision {
  decision: 'apply' | 'reject' | 'escalate';
  rationale: string;
  patch?: Record<string, unknown>;
}

export class Asker {
  private readonly kafka: Kafka;
  private readonly consumer: Consumer;
  private connected = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  public consumedTotal = 0;
  public answeredTotal = 0;
  public escalatedTotal = 0;
  public lastPolledAt: string | null = null;
  public lastError: string | null = null;

  constructor(
    private readonly cfg: AskerConfig,
    private readonly db: MappingAssistantDb,
    private readonly router: ModelRouter,
    private readonly templates: Map<string, VerifiedTemplate>,
    private readonly logger: Logger,
  ) {
    this.kafka = new Kafka({
      clientId: cfg.clientId,
      brokers: cfg.brokers,
      retry: { retries: 5, initialRetryTime: 300 },
    });
    this.consumer = this.kafka.consumer({
      groupId: cfg.groupId,
      sessionTimeout: 30_000,
      heartbeatInterval: 3_000,
    });
  }

  async start(): Promise<void> {
    try {
      await this.consumer.connect();
      await this.consumer.subscribe({ topics: [this.cfg.topic], fromBeginning: false });
      void this.consumer.run({
        eachMessage: async ({ message }) => {
          if (!message.value) return;
          try {
            const event = JSON.parse(message.value.toString()) as MappingPendingEvent;
            this.consumedTotal++;
            this.handleEvent(event);
          } catch (err) {
            this.lastError = String(err);
            this.logger.warn({ err: String(err) }, 'asker: failed to parse event');
          }
        },
      });
      this.connected = true;
      this.logger.info({ topic: this.cfg.topic }, 'asker: consumer running');
    } catch (err) {
      this.lastError = String(err);
      this.logger.warn({ err: String(err) }, 'asker: kafka connect failed (will run loop only)');
    }

    this.timer = setInterval(() => void this.tick(), this.cfg.pollIntervalMs);
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.connected) {
      await this.consumer.disconnect().catch(() => undefined);
      this.connected = false;
    }
  }

  /** Lagra ett pending-event lokalt. Synkron — kan kallas från konsument eller test. */
  handleEvent(event: MappingPendingEvent): void {
    if (!event.event_id || !event.source_system || !event.source_table || !event.mapper_name) {
      this.logger.warn({ event }, 'asker: missing required fields, dropping');
      return;
    }
    this.db.enqueueAsker({
      event_id: event.event_id,
      source_system: event.source_system,
      source_table: event.source_table,
      mapper_name: event.mapper_name,
      raw_event: event.raw_event ?? {},
      confidence: event.confidence,
    });
  }

  /** Polling-loop: hämta pending-jobb, kör mapping.ask, persistera resultat. */
  async tick(): Promise<{ processed: number }> {
    this.lastPolledAt = new Date().toISOString();
    const jobs = this.db.pendingAskerJobs(this.cfg.batchSize);
    let processed = 0;
    for (const job of jobs) {
      try {
        const decision = await this.askOne(job);
        this.db.resolveAskerJob({
          event_id: job.event_id,
          decision: decision.decision,
          patch: decision.patch ?? null,
          rationale: decision.rationale,
          suggestion_id: null,
        });
        // Audit-event för asker-beslut
        this.db.enqueueAudit({
          event_type: 'asker_resolved',
          payload: {
            event_id: job.event_id,
            source_system: job.source_system,
            source_table: job.source_table,
            mapper_name: job.mapper_name,
            decision: decision.decision,
            rationale: decision.rationale,
            timestamp: new Date().toISOString(),
          },
        });
        if (decision.decision === 'escalate') this.escalatedTotal++;
        else this.answeredTotal++;
        processed++;
      } catch (err) {
        this.lastError = String(err);
        this.logger.warn({ err: String(err), event_id: job.event_id }, 'asker: task failed (will retry)');
      }
    }
    return { processed };
  }

  private async askOne(job: ReturnType<MappingAssistantDb['pendingAskerJobs']>[number]): Promise<AskerDecision> {
    const tpl = this.templates.get('identify-pattern');
    if (!tpl) throw new Error('identify-pattern template not loaded');

    const userPrompt = fillTemplate(tpl.userTemplate, {
      EVENT_JSON: job.raw_event,
      MAPPER_NAME: job.mapper_name,
      RECENT_EVENTS: '(historik ej tillgänglig i Sprint 2 — fylls i 4.3+)',
    });

    const response = await this.router.invoke({
      task: 'mapping.ask',
      sensitivity: 'phi',
      systemPrompt: tpl.systemPrompt,
      userPrompt,
      maxTokens: 512,
      temperature: 0,
    });

    return parseAskerDecision(response.text);
  }

  status() {
    return {
      connected: this.connected,
      consumedTotal: this.consumedTotal,
      answeredTotal: this.answeredTotal,
      escalatedTotal: this.escalatedTotal,
      lastPolledAt: this.lastPolledAt,
      lastError: this.lastError,
    };
  }
}

/**
 * Parsar AI-svar till strukturerat beslut. AI:n förväntas returnera JSON
 * (per identify-pattern.md), men kan ibland ge prosa runt — vi plockar
 * första {…}-blocket. Misslyckas parsning → escalate.
 */
export function parseAskerDecision(text: string): AskerDecision {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    return { decision: 'escalate', rationale: 'AI returned non-JSON response — escalating' };
  }
  try {
    const parsed = JSON.parse(match[0]) as Partial<AskerDecision>;
    const decision = parsed.decision;
    if (decision !== 'apply' && decision !== 'reject' && decision !== 'escalate') {
      return { decision: 'escalate', rationale: `unrecognized decision: ${String(decision)}` };
    }
    return {
      decision,
      rationale: parsed.rationale ?? '',
      patch: parsed.patch as Record<string, unknown> | undefined,
    };
  } catch (err) {
    return {
      decision: 'escalate',
      rationale: `JSON parse failed: ${String(err)}`,
    };
  }
}
