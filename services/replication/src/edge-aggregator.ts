// EdgeEventAggregator — konsumerar edge-prefixade topics (edge-<instance>.core.*)
// från central Kafka, strippar prefixet och publicerar till motsvarande
// centrala domäntopic.
//
// I produktion skulle detta ersättas av Apache Kafka MirrorMaker 2.
// KafkaJS-baserad implementation här är tillräcklig för PoC:n och har samma
// end-to-end-semantik (topic-spegling + header-bevarande).

import {
  Kafka,
  type Admin,
  type Consumer,
  type Producer,
  type EachMessagePayload,
} from 'kafkajs';
import type { Logger } from 'pino';
import type { ReplicationConfig } from './config.js';

export interface AggregatorMetrics {
  aggregatedEvents: number;
  byEdge: Record<string, number>;
  byTopic: Record<string, number>;
  lastAggregatedAt: string | null;
  lastAggregationLagMs: number;
}

export interface EdgeAggregatorDeps {
  config: ReplicationConfig;
  kafka: Kafka;
  logger: Logger;
}

const EDGE_PREFIX_RE = /^edge-([^.]+)\.(.+)$/;

/** `edge-su.core.clinical.lab.result` → { edge: 'su', central: 'core.clinical.lab.result' } */
export function stripEdgePrefix(topic: string): { edge: string; central: string } | null {
  const m = EDGE_PREFIX_RE.exec(topic);
  if (!m) return null;
  return { edge: m[1], central: m[2] };
}

export class EdgeEventAggregator {
  private consumer: Consumer | null = null;
  private producer: Producer | null = null;
  readonly metrics: AggregatorMetrics = {
    aggregatedEvents: 0,
    byEdge: {},
    byTopic: {},
    lastAggregatedAt: null,
    lastAggregationLagMs: 0,
  };

  constructor(private readonly deps: EdgeAggregatorDeps) {}

  async start(): Promise<void> {
    const { config, kafka, logger } = this.deps;
    const topics = config.edgeInstances.flatMap((id) =>
      config.aggregatedTopics.map((t) => `edge-${id}.${t}`),
    );

    // 1. Pre-skapa edge-prefixade topics så consumern kan subscriba även innan
    //    någon edge-nod har producerat något. `allowAutoTopicCreation=true` på
    //    consumern räcker inte — KafkaJS fetchar metadata före första run()
    //    och crashar om topic inte existerar.
    const admin = kafka.admin();
    try {
      await admin.connect();
      const existing = new Set(await admin.listTopics());
      const missing = topics.filter((t) => !existing.has(t));
      if (missing.length > 0) {
        await admin.createTopics({
          topics: missing.map((topic) => ({
            topic,
            numPartitions: 3,
            replicationFactor: 1,
            configEntries: [{ name: 'retention.ms', value: '2592000000' }], // 30d
          })),
          waitForLeaders: true,
        });
        logger.info({ created: missing.length }, 'pre-created edge-prefixed topics');
      }
    } catch (err) {
      logger.warn({ err }, 'admin pre-create failed — continuing anyway');
    } finally {
      await admin.disconnect().catch(() => {
        /* noop */
      });
    }

    this.consumer = kafka.consumer({
      groupId: 'central-aggregator',
      allowAutoTopicCreation: true,
    });
    this.producer = kafka.producer({
      idempotent: true,
      allowAutoTopicCreation: true,
    });

    await this.producer.connect();
    await this.consumer.connect();
    // fromBeginning=true: om demo-scenariot redan har buffrade edge-events,
    // aggregerar vi allt som någonsin kommit in.
    await this.consumer.subscribe({ topics, fromBeginning: true });
    await this.consumer.run({
      eachMessage: async (payload) => this.handleMessage(payload),
    });
    logger.info(
      { topics: topics.length, edgeInstances: config.edgeInstances.length },
      'edge-aggregator started',
    );
  }

  private async handleMessage(payload: EachMessagePayload): Promise<void> {
    const { topic, message } = payload;
    const parsed = stripEdgePrefix(topic);
    if (!parsed) {
      this.deps.logger.warn({ topic }, 'edge-aggregator: topic without edge-prefix, skipping');
      return;
    }
    const { edge, central } = parsed;

    const edgeTimestampHeader = headerString(message.headers, 'x-edge-timestamp');
    const edgeTimestampMs = edgeTimestampHeader ? Number(edgeTimestampHeader) : undefined;
    const now = Date.now();
    const lagMs = edgeTimestampMs && Number.isFinite(edgeTimestampMs) ? now - edgeTimestampMs : 0;

    try {
      await this.producer!.send({
        topic: central,
        messages: [
          {
            key: message.key,
            value: message.value,
            headers: {
              ...(message.headers ?? {}),
              'x-edge-instance': edge,
              'x-aggregated-at': String(now),
              'x-aggregation-lag-ms': String(lagMs),
            },
          },
        ],
      });
      this.metrics.aggregatedEvents++;
      this.metrics.byEdge[edge] = (this.metrics.byEdge[edge] ?? 0) + 1;
      this.metrics.byTopic[central] = (this.metrics.byTopic[central] ?? 0) + 1;
      this.metrics.lastAggregatedAt = new Date(now).toISOString();
      this.metrics.lastAggregationLagMs = lagMs;
    } catch (err) {
      this.deps.logger.error({ err, edge, central }, 'edge-aggregator: produce failed');
    }
  }

  async stop(): Promise<void> {
    await safely(() => this.consumer?.disconnect());
    await safely(() => this.producer?.disconnect());
  }
}

function headerString(
  headers: EachMessagePayload['message']['headers'],
  name: string,
): string | null {
  if (!headers) return null;
  const raw = headers[name];
  if (raw == null) return null;
  if (typeof raw === 'string') return raw;
  if (Buffer.isBuffer(raw)) return raw.toString('utf8');
  return null;
}

async function safely(fn: () => Promise<void> | undefined): Promise<void> {
  try {
    await fn();
  } catch {
    /* noop */
  }
}
