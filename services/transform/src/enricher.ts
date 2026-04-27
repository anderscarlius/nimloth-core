// Enricher — konsumerar raw-topics, dispatchar per source_table och
// publicerar anrikade domänevents till rätt topic.

import type { Logger } from 'pino';
import { Kafka, type Consumer, type Producer } from 'kafkajs';
import pg from 'pg';
import type { TransformConfig, DbCfg } from './config.js';
import { PatientCache } from './patient-cache.js';
import { DqdMetrics } from './quality.js';
import { MAPPERS } from './mappings/index.js';
import { randomUUID } from 'node:crypto';
import type { CdcRawEvent, MapperContext, MapperResult } from './types.js';

export class Enricher {
  private readonly kafka: Kafka;
  private readonly consumer: Consumer;
  private readonly producer: Producer;
  public readonly patients = new PatientCache();
  public readonly metrics = new DqdMetrics();

  constructor(private readonly config: TransformConfig, private readonly logger: Logger) {
    this.kafka = new Kafka({
      clientId: config.kafka.clientId,
      brokers: config.kafka.brokers,
      retry: { retries: 10, initialRetryTime: 300 },
    });
    this.consumer = this.kafka.consumer({
      groupId: config.kafka.groupId,
      sessionTimeout: 30000,
      heartbeatInterval: 3000,
    });
    this.producer = this.kafka.producer({ idempotent: true, maxInFlightRequests: 5 });
  }

  private metricsTimer: ReturnType<typeof setInterval> | null = null;

  async start(): Promise<void> {
    // Pre-populera patient-cache direkt från källsystemens DB för att undvika
    // race condition där procedure/observation-events processas innan motsvarande
    // patients-event (Debezium snapshot går alfabetiskt och patients kommer sent).
    await this.prePopulatePatientCache();

    await this.producer.connect();
    await this.consumer.connect();

    // Periodisk skip-publish till core.system.quality.metrics. Mapping-
    // assistant:s Observer aggregerar dessa events.
    this.metricsTimer = setInterval(() => void this.flushSkips(), 5_000);
    this.logger.info({ topics: this.config.rawTopics }, 'Subscribing to raw CDC topics');
    await this.consumer.subscribe({ topics: this.config.rawTopics, fromBeginning: true });
    await this.consumer.run({
      eachMessage: async ({ topic, message }) => {
        try {
          await this.handleMessage(topic, message);
        } catch (err) {
          this.metrics.recordError();
          this.logger.error({ err, topic }, 'Transform error');
        }
      },
    });
    this.logger.info('Transform running');
  }

  private async handleMessage(
    topic: string,
    message: { key: Buffer | null; value: Buffer | null },
  ): Promise<void> {
    if (!message.value) return;
    const raw = JSON.parse(message.value.toString()) as CdcRawEvent;

    // Fyll patient-cache från patients-tabellen innan vi kan anrika andra events.
    if (raw.source_table === 'patients') {
      const data = (raw.after ?? raw.before) as Record<string, unknown> | null;
      const pid = data?.patient_id as number | undefined;
      const pnr = data?.personnummer as string | undefined;
      if (pid != null && pnr) this.patients.upsert(raw.source_system, pid, pnr);
    }

    const mapper = MAPPERS[raw.source_table];
    if (!mapper) {
      // Ingen mappare registrerad för denna tabell — t.ex. referrals, clinical_notes
      // (kan läggas till senare). Hoppa tyst.
      return;
    }

    const ctx: MapperContext = {
      instanceId: this.config.instanceId,
      patients: this.patients,
      metrics: this.metrics,
      logger: this.logger,
    };
    const result = mapper(raw, ctx);
    if (!result) return;
    const results = Array.isArray(result) ? result : [result];

    for (const r of results) {
      // Mappers som rapporterar confidence='low' publicerar till
      // mapping.pending istället för måltopiken — eventet hålls tillbaka
      // tills asker (eller mänsklig granskning) fattat ett beslut.
      if (r.confidence === 'low') {
        await this.publishPending(raw, r);
        this.metrics.recordSkip({
          source_system: raw.source_system,
          source_table: raw.source_table,
          reason: r.rationale ?? 'low_confidence',
        });
        continue;
      }
      await this.producer.send({
        topic: r.topic,
        messages: [
          {
            key: typeof r.event.patient_id === 'string' ? r.event.patient_id : null,
            value: JSON.stringify(r.event),
            headers: {
              'content-type': 'application/json',
              'event-type': r.topic,
              'source-system': raw.source_system,
              'source-table': raw.source_table,
              'x-edge-instance': this.config.instanceId,
            },
          },
        ],
      });
      this.metrics.recordProcessed(r.topic);
    }

    // Latens: CDC source timestamp → publicering
    const sourceTs = Date.parse(raw.timestamp);
    if (!Number.isNaN(sourceTs)) this.metrics.recordLatency(sourceTs);

    this.logger.debug(
      { topic, table: raw.source_table, op: raw.operation, produced: results.length },
      'Transformed',
    );
  }

  async stop(): Promise<void> {
    this.logger.info('Stopping enricher');
    if (this.metricsTimer) clearInterval(this.metricsTimer);
    this.metricsTimer = null;
    await this.flushSkips().catch(() => undefined);
    await this.consumer.disconnect();
    await this.producer.disconnect();
  }

  /** Drainar skip-buffert till core.system.quality.metrics. */
  private async flushSkips(): Promise<void> {
    const skips = this.metrics.drainSkips();
    if (skips.length === 0) return;
    const messages = skips.map((s) => ({
      key: `${s.source_system}.${s.source_table}.${s.column_name ?? ''}.${s.reason}`,
      value: JSON.stringify({ type: 'skip', ...s }),
      headers: { 'content-type': 'application/json', 'event-type': 'quality.skip' },
    }));
    try {
      await this.producer.send({ topic: 'core.system.quality.metrics', messages });
      this.logger.debug({ count: skips.length }, 'flushed skip events');
    } catch (err) {
      // Lägg tillbaka i bufferten — kommer publiceras vid nästa flush
      for (const s of skips) this.metrics.skipBuffer.push(s);
      this.logger.warn({ err: String(err) }, 'flushSkips failed (will retry)');
    }
  }

  /** Publicera ett "låg confidence"-event till core.system.mapping.pending. */
  private async publishPending(raw: CdcRawEvent, r: MapperResult): Promise<void> {
    const eventId = randomUUID();
    const payload = {
      event_id: eventId,
      source_system: raw.source_system,
      source_table: raw.source_table,
      mapper_name: `${raw.source_table}-mapper`,
      target_topic: r.topic,
      raw_event: raw.after ?? raw.before ?? null,
      proposed_event: r.event,
      confidence: 'low',
      rationale: r.rationale ?? null,
      timestamp: new Date().toISOString(),
    };
    try {
      await this.producer.send({
        topic: 'core.system.mapping.pending',
        messages: [
          {
            key: eventId,
            value: JSON.stringify(payload),
            headers: {
              'content-type': 'application/json',
              'event-type': 'mapping.pending',
              'source-system': raw.source_system,
              'source-table': raw.source_table,
            },
          },
        ],
      });
      this.logger.info(
        { event_id: eventId, source_table: raw.source_table, target: r.topic },
        'published mapping.pending (confidence=low)',
      );
    } catch (err) {
      this.logger.warn({ err: String(err), event_id: eventId }, 'publishPending failed');
    }
  }

  private async prePopulatePatientCache(): Promise<void> {
    const preload = async (db: DbCfg | null, source: 'melior' | 'asynja'): Promise<number> => {
      if (!db) return 0;
      const pool = new pg.Pool({ ...db, max: 2 });
      try {
        const r = await pool.query<{ patient_id: number; personnummer: string }>(
          `SELECT patient_id, personnummer FROM patients WHERE personnummer IS NOT NULL`,
        );
        for (const row of r.rows) {
          this.patients.upsert(source, row.patient_id, row.personnummer);
        }
        return r.rowCount ?? 0;
      } finally {
        await pool.end();
      }
    };
    // Retry några gånger — databaserna kanske inte är redo vid uppstart.
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        const [m, a] = await Promise.all([
          preload(this.config.meliorDb, 'melior'),
          preload(this.config.asynjaDb, 'asynja'),
        ]);
        this.logger.info({ melior: m, asynja: a, attempt }, 'Patient-cache pre-populated');
        return;
      } catch (err) {
        this.logger.warn({ err, attempt }, 'DB not ready for cache pre-population — retrying');
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
    }
    this.logger.warn('Patient-cache pre-population failed — kör med tom cache (kommer populeras från patients-events)');
  }
}
