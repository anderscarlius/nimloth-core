// Transform-tjänst — bootstrap + HTTP-server + Enricher.

import express from 'express';
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { Enricher } from './enricher.js';
import { clientStatus, warmFromService } from './terminology-client.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);

  logger.info(
    {
      instance_id: config.instanceId,
      kafka_brokers: config.kafka.brokers,
      raw_topics: config.rawTopics,
      terminology_url: config.terminologyUrl,
    },
    'Starting transform service',
  );

  // Sprint 1 (P1): warma terminology-cachen från terminology-tjänsten.
  // Vid fel: fortsätt med inbyggda fallback-konstanter (samma data som
  // pre-Sprint-1) — ingen funktionell skillnad mot tidigare beteende.
  if (config.terminologyUrl) {
    await warmFromService(config.terminologyUrl, {
      timeoutMs: 3_000,
      logger: (msg, meta) => logger.info({ ...(meta as Record<string, unknown>) }, msg),
    });
  }
  logger.info(clientStatus(), 'terminology-client ready');

  const enricher = new Enricher(config, logger);

  const app = express();
  app.disable('x-powered-by');
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'transform',
      instance_id: config.instanceId,
      patient_cache_size: enricher.patients.size(),
      metrics: enricher.metrics.snapshot(),
    });
  });
  app.get('/metrics', (_req, res) => {
    const m = enricher.metrics.snapshot();
    const lines = [
      `# HELP core_transform_events_total Totalt antal transformerade events`,
      `# TYPE core_transform_events_total counter`,
      `core_transform_events_total{instance="${config.instanceId}"} ${m.total_processed}`,
      `# HELP core_transform_errors_total Totalt antal fel`,
      `# TYPE core_transform_errors_total counter`,
      `core_transform_errors_total{instance="${config.instanceId}"} ${m.total_errors}`,
      `# HELP core_transform_avg_latency_ms Genomsnittlig latens source→publicering`,
      `# TYPE core_transform_avg_latency_ms gauge`,
      `core_transform_avg_latency_ms{instance="${config.instanceId}"} ${m.avg_latency_ms}`,
    ];
    for (const [topic, cnt] of Object.entries(m.by_topic)) {
      lines.push(`core_transform_events_by_topic{instance="${config.instanceId}",topic="${topic}"} ${cnt}`);
    }
    for (const [flag, cnt] of Object.entries(m.flags)) {
      lines.push(`core_transform_quality_flags{instance="${config.instanceId}",flag="${flag}"} ${cnt}`);
    }
    res.type('text/plain; version=0.0.4').send(lines.join('\n') + '\n');
  });

  const server = app.listen(config.port, () => {
    logger.info({ port: config.port }, 'HTTP server ready');
  });

  try {
    await enricher.start();
  } catch (err) {
    logger.error({ err }, 'Failed to start enricher');
    process.exit(1);
  }

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutting down');
    server.close();
    try {
      await enricher.stop();
    } catch (err) {
      logger.warn({ err }, 'Error during shutdown');
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
