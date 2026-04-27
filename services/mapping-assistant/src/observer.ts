// Observer-flödet (Sprint 2, P4 Fas 4.2):
//
//   Kafka [core.system.quality.metrics]  →  SQLite [observer_skip_events]
//                                              ↓ rullande 24h
//                                          aggregera
//                                              ↓ tröskel
//                                          klassificera (policies)
//                                              ↓ autoSuggest=true
//                                          model-router (mapping.observe)
//                                              ↓
//                                          insert i suggestions
//                                          markera trigger (idempotent)
//
// Skip-events från transform har formen:
//   { type: 'skip', source_system, source_table, column_name?, reason, sample_value?, occurred_at, schema_snapshot? }
// Policy-snapshot beräknas på (sourceTable, columnName, reason).
// Tröskel + fönster konfigureras via env (default 10 events / 24h).

import { Kafka, type Consumer } from 'kafkajs';
import type { Logger } from 'pino';
import type { ModelRouter } from '@nimloth-core/model-router';
import type { MappingAssistantDb, SuggestionRow } from './db.js';
import type { VerifiedTemplate } from './prompt-store.js';
import { fillTemplate } from './prompt-store.js';
import {
  classifyPattern,
  hasPatientReference,
  hasPiiColumns,
  lookupPolicy,
  type Pattern,
} from './policies.js';

export interface QualityMetricEvent {
  type: 'skip' | 'flag' | 'snapshot';
  source_system: string;
  source_table?: string;
  column_name?: string | null;
  reason?: string;
  sample_value?: string | null;
  occurred_at?: string;
  /** Optional: kolumner som finns i nya tabellen — används av policy-classifier för pii-detektion. */
  schema_snapshot?: { columns: string[] };
  is_new_table?: boolean;
  is_new_column?: boolean;
}

export interface ObserverConfig {
  brokers: string[];
  clientId: string;
  groupId: string;
  topic: string;
  /** Hur stort rullande fönster räknas över. Default 86400 (24h). */
  windowSeconds: number;
  /** Antal events innan suggestion triggas. Default 10. */
  threshold: number;
  /** Hur ofta aggregat utvärderas. Default 60s. */
  evaluateIntervalMs: number;
  /** Rensa skip-events äldre än 2x window. Default 172800. */
  pruneSeconds: number;
}

export class Observer {
  private readonly kafka: Kafka;
  private readonly consumer: Consumer;
  private connected = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  public consumedTotal = 0;
  public skipsRecordedTotal = 0;
  public suggestionsCreatedTotal = 0;
  public lastEvaluatedAt: string | null = null;
  public lastError: string | null = null;

  constructor(
    private readonly cfg: ObserverConfig,
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
    // Connect best-effort. Misslyckas → utvärderingstimern startas ändå
    // (för bakåtkompatibilitet med skip-events som direkt-skrivits via API).
    try {
      await this.consumer.connect();
      await this.consumer.subscribe({ topics: [this.cfg.topic], fromBeginning: false });
      void this.consumer.run({
        eachMessage: async ({ message }) => {
          if (!message.value) return;
          try {
            const event = JSON.parse(message.value.toString()) as QualityMetricEvent;
            this.consumedTotal++;
            this.handleEvent(event);
          } catch (err) {
            this.lastError = String(err);
            this.logger.warn({ err: String(err) }, 'observer: failed to parse event');
          }
        },
      });
      this.connected = true;
      this.logger.info({ topic: this.cfg.topic }, 'observer: consumer running');
    } catch (err) {
      this.lastError = String(err);
      this.logger.warn({ err: String(err) }, 'observer: kafka connect failed (will run aggregator only)');
    }

    this.timer = setInterval(() => void this.evaluate(), this.cfg.evaluateIntervalMs);
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.connected) {
      await this.consumer.disconnect().catch(() => undefined);
      this.connected = false;
    }
  }

  /** Synkron handler för skip-events — exponerad för tester och direkt API. */
  handleEvent(event: QualityMetricEvent): void {
    if (event.type !== 'skip') return;
    if (!event.source_system || !event.source_table || !event.reason) return;
    this.db.recordSkipEvent({
      source_system: event.source_system,
      source_table: event.source_table,
      column_name: event.column_name ?? null,
      reason: event.reason,
      sample_value: event.sample_value ?? null,
      occurred_at: event.occurred_at,
    });
    this.skipsRecordedTotal++;
  }

  /** Periodisk: aggregera, kolla tröskel, skapa suggestion vid behov. */
  async evaluate(): Promise<{ evaluated: number; created: number }> {
    this.lastEvaluatedAt = new Date().toISOString();
    let created = 0;
    const aggregates = this.db.aggregateSkips(this.cfg.windowSeconds);
    for (const agg of aggregates) {
      if (agg.count < this.cfg.threshold) continue;
      if (this.db.isAggregateAlreadyTriggered(agg.source_table, agg.column_name, agg.reason)) continue;

      const pattern = inferPatternFromReason(agg.reason);
      const suggestion = await this.createObserverSuggestion(agg, pattern).catch((err) => {
        this.lastError = String(err);
        this.logger.warn({ err: String(err), agg }, 'observer: suggestion creation failed');
        return null;
      });
      if (suggestion) {
        this.db.recordAggregateTrigger({
          source_table: agg.source_table,
          column_name: agg.column_name,
          reason: agg.reason,
          suggestion_id: suggestion.id,
        });
        this.suggestionsCreatedTotal++;
        created++;
      }
    }
    // Rensa gamla rader för att undvika obegränsad tillväxt.
    const pruned = this.db.pruneOldSkips(this.cfg.pruneSeconds);
    if (pruned > 0) this.logger.debug({ pruned }, 'observer: pruned old skip events');
    return { evaluated: aggregates.length, created };
  }

  private async createObserverSuggestion(
    agg: ReturnType<MappingAssistantDb['aggregateSkips']>[number],
    pattern: Pattern,
  ): Promise<SuggestionRow | null> {
    const tpl = this.templates.get('explain-skip');
    if (!tpl) {
      throw new Error('explain-skip template not loaded');
    }
    const policy = lookupPolicy(pattern);
    const userPrompt = fillTemplate(tpl.userTemplate, {
      METRICS_JSON: JSON.stringify(
        {
          source_system: agg.source_system,
          source_table: agg.source_table,
          column_name: agg.column_name,
          reason: agg.reason,
          count_24h: agg.count,
          last_seen: agg.last_seen,
          sample_value: agg.sample_value,
        },
        null,
        2,
      ),
      SCHEMA_SNAPSHOT: '(observer har inte schema-info i Sprint 2 — detta fält fylls i 4.3+)',
    });

    const response = await this.router.invoke({
      task: 'mapping.observe',
      sensitivity: 'schema-only',
      systemPrompt: tpl.systemPrompt,
      userPrompt,
      maxTokens: 1024,
      temperature: 0,
    });

    const suggestion = this.db.insertSuggestion({
      task: 'mapping.observe',
      source: `${agg.source_system}.${agg.source_table}` + (agg.column_name ? `.${agg.column_name}` : ''),
      target: agg.reason,
      prompt_hash: response.promptHash,
      template_name: tpl.entry.name,
      template_sha: tpl.entry.sha256,
      provider_id: response.providerId,
      model_used: response.modelUsed,
      data_residency: response.dataResidency,
      input_tokens: response.inputTokens,
      output_tokens: response.outputTokens,
      latency_ms: response.latencyMs,
      generated_text: response.text,
      review_notes: `pattern=${pattern} riskLevel=${policy.riskLevel} autoSuggest=${policy.autoSuggest} blockEvents=${policy.blockEvents}`,
      proposed_path: null,
    });
    this.logger.info(
      { id: suggestion.id, agg, pattern, policy },
      'observer: suggestion created',
    );
    return suggestion;
  }

  status() {
    return {
      connected: this.connected,
      consumedTotal: this.consumedTotal,
      skipsRecordedTotal: this.skipsRecordedTotal,
      suggestionsCreatedTotal: this.suggestionsCreatedTotal,
      lastEvaluatedAt: this.lastEvaluatedAt,
      lastError: this.lastError,
      config: {
        windowSeconds: this.cfg.windowSeconds,
        threshold: this.cfg.threshold,
        evaluateIntervalMs: this.cfg.evaluateIntervalMs,
      },
    };
  }
}

/** Mappar skip-reason → pattern. Reason kommer från transformens recordSkip(reason). */
export function inferPatternFromReason(reason: string): Pattern {
  switch (reason) {
    case 'unknown_enum_value':
    case 'new_enum_value':
      return 'new_enum_value';
    case 'unknown_column':
    case 'new_column':
      return 'new_column';
    case 'unknown_table':
    case 'new_table':
      return 'new_table';
    case 'pii_table_no_patient_ref':
      return 'new_table_with_pii_no_patient_ref';
    default:
      return 'unknown';
  }
}

export { hasPiiColumns, hasPatientReference, classifyPattern };
