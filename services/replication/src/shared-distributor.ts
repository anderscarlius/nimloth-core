// SharedDataDistributor — publicerar data som alla edge-noder behöver.
//
// Topics (alla compacted, unlimited retention — skapade i Del 4):
//   core.shared.patient-index  — keyed på personnummer
//   core.shared.spar-register  — keyed på personnummer
//   core.shared.cds-rules      — keyed på rule_id
//   core.shared.terminology    — keyed på "{system}:{code}"
//
// Strategi för patient-index i Del 14:
//   1. Full-sync vid startup och med intervall (PATIENT_INDEX_SYNC_INTERVAL_MS, default 5 min)
//      — SELECT * FROM fhir_patients i core-db → send till core.shared.patient-index
//   2. Delta-sync: konsumera core.admin.patient.registered → publicera uppdatering.

import type { Kafka, Producer, Consumer } from 'kafkajs';
import type { Pool } from 'pg';
import type { Logger } from 'pino';
import type { ReplicationConfig } from './config.js';

export interface DistributorMetrics {
  patientIndexPublished: number;
  patientIndexFullSyncs: number;
  deltaEvents: number;
  lastFullSyncAt: string | null;
}

export interface SharedDistributorDeps {
  config: ReplicationConfig;
  kafka: Kafka;
  pool: Pool;
  logger: Logger;
}

interface PatientRow {
  personnummer: string;
  fornamn: string | null;
  efternamn: string | null;
  fodelsedatum: Date | string | null;
  kon: string | null;
  source_systems: string[] | null;
  updated_at: Date | string;
}

export interface PatientIndexMessage {
  personnummer: string;
  name: string;
  fornamn: string | null;
  efternamn: string | null;
  birth_date: string | null;
  gender: string | null;
  source_systems: string[];
  updated_at: string;
}

export function buildPatientIndexMessage(row: PatientRow): PatientIndexMessage {
  const fornamn = row.fornamn ?? null;
  const efternamn = row.efternamn ?? null;
  return {
    personnummer: row.personnummer,
    name: [fornamn, efternamn].filter(Boolean).join(' ') || row.personnummer,
    fornamn,
    efternamn,
    birth_date:
      row.fodelsedatum instanceof Date
        ? row.fodelsedatum.toISOString().slice(0, 10)
        : typeof row.fodelsedatum === 'string'
          ? row.fodelsedatum.slice(0, 10)
          : null,
    gender: row.kon,
    source_systems: Array.isArray(row.source_systems) ? row.source_systems : [],
    updated_at:
      row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

export class SharedDataDistributor {
  private producer: Producer | null = null;
  private consumer: Consumer | null = null;
  private syncTimer: NodeJS.Timeout | null = null;
  readonly metrics: DistributorMetrics = {
    patientIndexPublished: 0,
    patientIndexFullSyncs: 0,
    deltaEvents: 0,
    lastFullSyncAt: null,
  };

  constructor(private readonly deps: SharedDistributorDeps) {}

  async start(): Promise<void> {
    const { kafka, logger, config } = this.deps;
    this.producer = kafka.producer({ allowAutoTopicCreation: true });
    await this.producer.connect();

    // Kör en initial full-sync direkt (låt det inte blockera startup)
    void this.runFullSync().catch((err) =>
      logger.warn({ err }, 'initial patient-index full-sync failed'),
    );

    // Periodvis
    this.syncTimer = setInterval(
      () => void this.runFullSync().catch((err) => logger.warn({ err }, 'periodic full-sync failed')),
      config.patientIndex.fullSyncIntervalMs,
    );

    // Delta via core.admin.patient.registered
    await this.startDeltaConsumer();

    logger.info(
      { intervalMs: config.patientIndex.fullSyncIntervalMs },
      'shared-distributor started',
    );
  }

  async runFullSync(): Promise<void> {
    const { pool, logger, config } = this.deps;
    if (!this.producer) return;

    const r = await pool.query<PatientRow>(
      `SELECT personnummer, fornamn, efternamn, fodelsedatum, kon, source_systems, updated_at
         FROM fhir_patients
         ORDER BY personnummer
         LIMIT $1`,
      [config.patientIndex.batchSize],
    );
    if (r.rowCount === 0) {
      logger.debug('full-sync: no patients in fhir_patients');
      this.metrics.patientIndexFullSyncs++;
      this.metrics.lastFullSyncAt = new Date().toISOString();
      return;
    }

    const messages = r.rows.map((row) => {
      const msg = buildPatientIndexMessage(row);
      return {
        key: msg.personnummer,
        value: JSON.stringify(msg),
      };
    });

    await this.producer.send({
      topic: 'core.shared.patient-index',
      messages,
    });
    this.metrics.patientIndexPublished += messages.length;
    this.metrics.patientIndexFullSyncs++;
    this.metrics.lastFullSyncAt = new Date().toISOString();
    logger.info(
      { count: messages.length, totalPublished: this.metrics.patientIndexPublished },
      'patient-index full-sync complete',
    );
  }

  private async startDeltaConsumer(): Promise<void> {
    const { kafka, logger } = this.deps;
    this.consumer = kafka.consumer({
      groupId: 'central-distributor-delta',
      allowAutoTopicCreation: true,
    });
    try {
      await this.consumer.connect();
      await this.consumer.subscribe({
        topics: ['core.admin.patient.registered', 'core.admin.patient.transferred'],
        fromBeginning: false,
      });
      await this.consumer.run({
        eachMessage: async ({ message }) => {
          if (!message.value || !this.producer) return;
          try {
            const data = JSON.parse(message.value.toString()) as Record<string, unknown>;
            const payload = (data.payload as Record<string, unknown> | undefined) ?? data;
            const pnr =
              (typeof data.patient_id === 'string' ? data.patient_id : null) ??
              (typeof payload.personnummer === 'string' ? payload.personnummer : null);
            if (!pnr) return;

            const msg: PatientIndexMessage = {
              personnummer: pnr,
              name: String(payload.name ?? pnr),
              fornamn: (payload.fornamn as string | undefined) ?? null,
              efternamn: (payload.efternamn as string | undefined) ?? null,
              birth_date: (payload.birth_date as string | undefined) ?? null,
              gender: (payload.gender as string | undefined) ?? null,
              source_systems: Array.isArray(payload.source_systems)
                ? (payload.source_systems as string[])
                : [],
              updated_at: new Date().toISOString(),
            };
            await this.producer.send({
              topic: 'core.shared.patient-index',
              messages: [{ key: pnr, value: JSON.stringify(msg) }],
            });
            this.metrics.deltaEvents++;
            this.metrics.patientIndexPublished++;
          } catch (err) {
            logger.warn({ err }, 'delta patient-index event failed');
          }
        },
      });
      logger.info('delta-consumer started (core.admin.patient.*)');
    } catch (err) {
      logger.warn({ err }, 'delta-consumer start failed — full-sync still active');
    }
  }

  async stop(): Promise<void> {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    await safely(() => this.consumer?.disconnect());
    await safely(() => this.producer?.disconnect());
  }
}

async function safely(fn: () => Promise<void> | undefined): Promise<void> {
  try {
    await fn();
  } catch {
    /* noop */
  }
}
