// Replication-tjänst — bootstrap.
// Kör EdgeEventAggregator + SharedDataDistributor. Exponerar /health /metrics
// på REPLICATION_PORT (default 3007).

import express from 'express';
import { Kafka } from 'kafkajs';
import pg from 'pg';

import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { EdgeEventAggregator } from './edge-aggregator.js';
import { SharedDataDistributor } from './shared-distributor.js';
import { TopologyTracker } from './topology-tracker.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);

  logger.info(
    {
      port: config.port,
      kafka_brokers: config.kafka.brokers,
      db_host: config.db.host,
      edge_instances: config.edgeInstances,
      aggregated_topics: config.aggregatedTopics.length,
      full_sync_interval_ms: config.patientIndex.fullSyncIntervalMs,
    },
    'replication starting',
  );

  // DB pool (för SharedDataDistributor)
  const pool = new pg.Pool({
    host: config.db.host,
    port: config.db.port,
    database: config.db.database,
    user: config.db.user,
    password: config.db.password,
    max: 5,
  });
  try {
    await pool.query('SELECT 1');
    logger.info('core-db connected');
  } catch (err) {
    logger.error({ err }, 'cannot connect to core-db');
    process.exit(1);
  }

  // Kafka
  const kafka = new Kafka({
    clientId: config.kafka.clientId,
    brokers: config.kafka.brokers,
    retry: { retries: 8, initialRetryTime: 300 },
  });

  const aggregator = new EdgeEventAggregator({ config, kafka, logger });
  const distributor = new SharedDataDistributor({ config, kafka, pool, logger });
  const topology = new TopologyTracker({ kafka, logger });

  void aggregator.start().catch((err) => logger.error({ err }, 'aggregator start failed'));
  void distributor.start().catch((err) => logger.error({ err }, 'distributor start failed'));
  void topology.start().catch((err) => logger.error({ err }, 'topology tracker start failed'));

  // Status-server
  const app = express();
  // CORS för dashboard-proxyn + browser-access
  app.use((_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    next();
  });
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'replication',
      aggregator: aggregator.metrics,
      distributor: distributor.metrics,
    });
  });
  app.get('/topology', (_req, res) => {
    res.json(topology.getTopology());
  });
  app.get('/metrics', (_req, res) => {
    const a = aggregator.metrics;
    const d = distributor.metrics;
    const lines = [
      '# HELP core_aggregated_events_total Antal events aggregerade edge → central',
      '# TYPE core_aggregated_events_total counter',
      `core_aggregated_events_total ${a.aggregatedEvents}`,
      '# HELP core_aggregation_lag_ms Senaste replikerings-lag i ms',
      '# TYPE core_aggregation_lag_ms gauge',
      `core_aggregation_lag_ms ${a.lastAggregationLagMs}`,
      '# HELP core_patient_index_published_total Antal patientindex-meddelanden publicerade',
      '# TYPE core_patient_index_published_total counter',
      `core_patient_index_published_total ${d.patientIndexPublished}`,
    ];
    for (const [edge, n] of Object.entries(a.byEdge)) {
      lines.push(`core_aggregated_by_edge{edge="${edge}"} ${n}`);
    }
    for (const [topic, n] of Object.entries(a.byTopic)) {
      lines.push(`core_aggregated_by_topic{topic="${topic}"} ${n}`);
    }
    res.type('text/plain').send(lines.join('\n'));
  });
  const server = app.listen(config.port, () => {
    logger.info({ port: config.port }, 'replication status server listening');
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'replication shutdown');
    await aggregator.stop();
    await distributor.stop();
    await topology.stop();
    server.close();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[replication] fatal:', err);
  process.exit(1);
});
