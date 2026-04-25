// Enricher — konsumerar raw-topics, dispatchar per source_table och
// publicerar anrikade domänevents till rätt topic.

import type { Logger } from 'pino';
import { Kafka, type Consumer, type Producer } from 'kafkajs';
import pg from 'pg';
import type { TransformConfig, DbCfg } from './config.js';
import { PatientCache } from './patient-cache.js';
import { DqdMetrics } from './quality.js';
import { MAPPERS } from './mappings/index.js';
import type { CdcRawEvent, MapperContext } from './types.js';

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

  async start(): Promise<void> {
    // Pre-populera patient-cache direkt från källsystemens DB för att undvika
    // race condition där procedure/observation-events processas innan motsvarande
    // patients-event (Debezium snapshot går alfabetiskt och patients kommer sent).
    await this.prePopulatePatientCache();

    await this.producer.connect();
    await this.consumer.connect();
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
    await this.consumer.disconnect();
    await this.producer.disconnect();
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
