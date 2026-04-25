// Ingest-tjänst — bootstrap + HTTP-server + CDC-pipeline.
//
// Konsumerar Debezium-events från Kafka och republicerar standardiserade
// CdcRawEvent:s till vgr.cdc.{source}.{instance}.raw.

import express from 'express';
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { CdcConsumer } from './cdc-consumer.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);

  logger.info(
    {
      instance_id: config.instanceId,
      kafka_brokers: config.kafka.brokers,
      cdc_topic_prefix: config.cdc.topicPrefix,
      raw_topic: config.cdc.rawTopic,
    },
    'Starting ingest service',
  );

  const consumer = new CdcConsumer(config, logger);

  // HTTP-server (health + metrics)
  const app = express();
  app.disable('x-powered-by');

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'ingest',
      instance_id: config.instanceId,
      metrics: consumer.metrics,
    });
  });

  app.get('/metrics', (_req, res) => {
    // Enkel text-format (Prometheus-ish). En full Prometheus-exposition
    // läggs till om/när prom-client beroendet lagts till (Prompt 11).
    const m = consumer.metrics;
    const lines = [
      `# HELP core_ingest_cdc_events_total Totalt antal processade CDC-events`,
      `# TYPE core_ingest_cdc_events_total counter`,
      `core_ingest_cdc_events_total{instance="${config.instanceId}"} ${m.processed}`,
      `# HELP core_ingest_cdc_errors_total Totalt antal fel`,
      `# TYPE core_ingest_cdc_errors_total counter`,
      `core_ingest_cdc_errors_total{instance="${config.instanceId}"} ${m.errors}`,
    ];
    for (const [op, cnt] of Object.entries(m.byOperation)) {
      lines.push(`core_ingest_cdc_events_by_op{instance="${config.instanceId}",op="${op}"} ${cnt}`);
    }
    for (const [table, cnt] of Object.entries(m.byTable)) {
      lines.push(`core_ingest_cdc_events_by_table{instance="${config.instanceId}",table="${table}"} ${cnt}`);
    }
    res.type('text/plain; version=0.0.4').send(lines.join('\n') + '\n');
  });

  const server = app.listen(config.port, () => {
    logger.info({ port: config.port }, 'HTTP server ready');
  });

  // Starta Kafka-consumer
  try {
    await consumer.start();
  } catch (err) {
    logger.error({ err }, 'Failed to start CDC consumer');
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutting down');
    server.close();
    try {
      await consumer.stop();
    } catch (err) {
      logger.warn({ err }, 'Error during consumer shutdown');
    }
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
