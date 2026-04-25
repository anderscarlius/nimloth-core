// CDC-consumer: konsumerar Debezium-events från vgr.cdc.{source}.{instance}.public.*
// och publicerar standardiserade CdcRawEvent:s till {prefix}.raw.
//
// Debezium skickar (med transforms.unwrap) flata records med metadata-fält:
//   __op:             'c' (create/insert) | 'u' (update) | 'd' (delete) | 'r' (snapshot read)
//   __source_ts_ms:   epoch-ms från källan
//   __source_table:   tabellnamn
//   __source_lsn:     WAL log sequence number
//   __source_txId:    transaktions-ID
//   __deleted:        'true' | 'false' (via delete.handling.mode=rewrite)

import type { Logger } from 'pino';
import { Kafka, type Consumer, type Producer } from 'kafkajs';
import type { IngestConfig } from './config.js';

export type CdcOperation = 'INSERT' | 'UPDATE' | 'DELETE' | 'SNAPSHOT';

export interface CdcRawEvent {
  source_system: 'melior' | 'asynja';
  source_instance: string;
  source_table: string;
  operation: CdcOperation;
  timestamp: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  metadata: {
    transaction_id?: string;
    lsn?: string;
  };
}

export interface CdcConsumerMetrics {
  processed: number;
  errors: number;
  byTable: Record<string, number>;
  byOperation: Record<CdcOperation, number>;
  lastEventAt: string | null;
}

const OP_MAP: Record<string, CdcOperation> = {
  c: 'INSERT',
  u: 'UPDATE',
  d: 'DELETE',
  r: 'SNAPSHOT',
};

export class CdcConsumer {
  private readonly kafka: Kafka;
  private readonly consumer: Consumer;
  private readonly producer: Producer;
  private readonly sourceTopicPattern: RegExp;

  public readonly metrics: CdcConsumerMetrics = {
    processed: 0,
    errors: 0,
    byTable: {},
    byOperation: { INSERT: 0, UPDATE: 0, DELETE: 0, SNAPSHOT: 0 },
    lastEventAt: null,
  };

  constructor(private readonly config: IngestConfig, private readonly logger: Logger) {
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
    this.producer = this.kafka.producer({
      idempotent: true,
      maxInFlightRequests: 5,
    });

    // Matchar vgr.cdc.melior.{instance}.public.{table} samt vgr.cdc.asynja.public.{table}
    // men EJ .raw (vår egen output-topic).
    this.sourceTopicPattern = /^vgr\.cdc\.(melior|asynja)(?:\.\w+)?\.public\.\w+$/;
  }

  async start(): Promise<void> {
    await this.producer.connect();
    await this.consumer.connect();

    this.logger.info({ pattern: this.sourceTopicPattern.source }, 'Subscribing to CDC topics');
    await this.consumer.subscribe({
      topics: [this.sourceTopicPattern],
      fromBeginning: true,
    });

    await this.consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          await this.handleMessage(topic, partition, message);
        } catch (err) {
          this.metrics.errors++;
          this.logger.error({ err, topic, partition }, 'Fel vid CDC-event-hantering');
        }
      },
    });

    this.logger.info('CDC consumer running');
  }

  private async handleMessage(
    topic: string,
    partition: number,
    message: { key: Buffer | null; value: Buffer | null; headers?: Record<string, unknown> },
  ): Promise<void> {
    if (!message.value) {
      // Tombstone för DELETE (när delete.handling.mode=rewrite skickas också en tombstone)
      return;
    }

    const raw = JSON.parse(message.value.toString()) as Record<string, unknown>;
    const rawOp = raw.__op;
    const opCode: string =
      typeof rawOp === 'string' ? rawOp : raw.__deleted === 'true' ? 'd' : 'c';
    const operation = OP_MAP[opCode] ?? 'INSERT';
    const sourceTable = (raw.__source_table as string) ?? topic.split('.').pop() ?? 'unknown';
    const sourceTsMs = Number(raw.__source_ts_ms ?? Date.now());
    const lsn = raw.__source_lsn ? String(raw.__source_lsn) : undefined;
    const txId = raw.__source_txId ? String(raw.__source_txId) : undefined;

    // Infer source system from topic: vgr.cdc.{source}...
    const topicParts = topic.split('.');
    const sourceSystem = (topicParts[2] as 'melior' | 'asynja') ?? 'melior';
    const sourceInstance = sourceSystem === 'melior' ? `melior-${this.config.instanceId}` : 'asynja';

    // Rensa Debezium-metadatafält från "after"-payloaden
    const after = this.stripMetadata(raw);

    const event: CdcRawEvent = {
      source_system: sourceSystem,
      source_instance: sourceInstance,
      source_table: sourceTable,
      operation,
      timestamp: new Date(sourceTsMs).toISOString(),
      before: operation === 'DELETE' ? after : null,
      after: operation === 'DELETE' ? null : after,
      metadata: { transaction_id: txId, lsn },
    };

    this.metrics.processed++;
    this.metrics.byTable[sourceTable] = (this.metrics.byTable[sourceTable] ?? 0) + 1;
    this.metrics.byOperation[operation]++;
    this.metrics.lastEventAt = event.timestamp;

    this.logger.info(
      {
        topic,
        partition,
        table: sourceTable,
        op: operation,
        patient_id: (after.patient_id ?? after.PATIENT_ID ?? after.personnummer) as unknown,
        instance_id: this.config.instanceId,
      },
      'CDC event processed',
    );

    await this.producer.send({
      topic: this.config.cdc.rawTopic,
      messages: [
        {
          key: this.deriveKey(after),
          value: JSON.stringify(event),
          headers: {
            'content-type': 'application/json',
            'source-system': sourceSystem,
            'source-table': sourceTable,
            operation,
          },
        },
      ],
    });
  }

  private stripMetadata(raw: Record<string, unknown>): Record<string, unknown> {
    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (!k.startsWith('__')) cleaned[k] = v;
    }
    return cleaned;
  }

  private deriveKey(row: Record<string, unknown>): string | null {
    // Försök patient_id, pnr eller fallback null
    const pid = row.patient_id ?? row.PATIENT_ID;
    if (pid != null) return String(pid);
    const pnr = row.personnummer ?? row.PERSONNUMMER;
    if (pnr != null) return String(pnr);
    return null;
  }

  async stop(): Promise<void> {
    this.logger.info('Stopping CDC consumer');
    await this.consumer.disconnect();
    await this.producer.disconnect();
  }
}
