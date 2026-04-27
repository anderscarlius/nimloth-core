// Bootstrap: ladda config + verifiera prompts + initiera router + DB + publisher.

import { dirname } from 'node:path';
import { mkdirSync, existsSync } from 'node:fs';
import { ModelRouter, loadRouterConfig, type RouterAuditEvent } from '@nimloth-core/model-router';
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { MappingAssistantDb } from './db.js';
import { loadAndVerifyPrompts } from './prompt-store.js';
import { Proposer } from './proposer.js';
import { Observer } from './observer.js';
import { Asker } from './asker.js';
import { AuditPublisher } from './audit-publisher.js';
import { createApp } from './server.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);
  logger.info({ port: config.port }, 'starting mapping-assistant');

  // 1. Säkerställ datafiler
  const dbDir = dirname(config.dbPath);
  if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });

  const db = new MappingAssistantDb(config.dbPath);
  db.migrate(config.migrationsPath, logger);

  // 2. Verifiera prompt-templates mot manifest
  const verification = loadAndVerifyPrompts(config.promptsPath);
  db.recordTemplateVerification({
    manifest_sha: verification.manifestSha,
    total_templates: verification.passed + verification.failed,
    passed: verification.passed,
    failed: verification.failed,
    failure_details: verification.failureDetails.length > 0
      ? JSON.stringify(verification.failureDetails)
      : null,
  });
  if (verification.failed > 0) {
    logger.error(
      { failureDetails: verification.failureDetails, manifestSha: verification.manifestSha },
      'prompt manifest verification failed',
    );
    if (config.requireValidPrompts) {
      throw new Error(
        `Prompt manifest verification failed (${verification.failed} issues). Set REQUIRE_VALID_PROMPTS=false to override.`,
      );
    }
  } else {
    logger.info(
      { manifestSha: verification.manifestSha, templates: verification.passed },
      'prompt manifest verified',
    );
  }

  // 3. Ladda model-routing-config + initiera router
  const routerConfig = loadRouterConfig(config.routingConfigPath);
  const router = new ModelRouter(routerConfig, {
    audit: (event: RouterAuditEvent) => {
      // Varje LLM-anrop blir ett audit-event i outbox.
      db.enqueueAudit({ event_type: 'llm_invoked', payload: event });
    },
  });
  logger.info(
    {
      providers: router.listProviders().map((p) => ({ id: p.id, enabled: p.enabled })),
      rules: router.listRules().map((r) => r.task),
    },
    'model-router initialized',
  );

  // 4. Audit-publisher (Kafka)
  const publisher = new AuditPublisher(
    {
      brokers: config.kafka.brokers,
      clientId: config.kafka.clientId,
      topic: config.kafka.auditTopic,
      drainIntervalMs: config.kafka.drainIntervalMs,
      batchSize: 50,
    },
    db,
    logger,
  );
  await publisher.start();

  // 5. Observer (Fas 4.2) — Kafka-consumer på core.system.quality.metrics
  let observer: Observer | null = null;
  if (config.observer.enabled) {
    observer = new Observer(
      {
        brokers: config.kafka.brokers,
        clientId: `${config.kafka.clientId}-observer`,
        groupId: `${config.kafka.groupPrefix}-observer`,
        topic: config.kafka.qualityTopic,
        windowSeconds: config.observer.windowSeconds,
        threshold: config.observer.threshold,
        evaluateIntervalMs: config.observer.evaluateIntervalMs,
        pruneSeconds: config.observer.pruneSeconds,
      },
      db,
      router,
      verification.templates,
      logger.child({ component: 'observer' }),
    );
    await observer.start();
  }

  // 6. Asker (Fas 4.2) — Kafka-consumer på core.system.mapping.pending
  let asker: Asker | null = null;
  if (config.asker.enabled) {
    asker = new Asker(
      {
        brokers: config.kafka.brokers,
        clientId: `${config.kafka.clientId}-asker`,
        groupId: `${config.kafka.groupPrefix}-asker`,
        topic: config.kafka.askerTopic,
        pollIntervalMs: config.asker.pollIntervalMs,
        batchSize: 10,
      },
      db,
      router,
      verification.templates,
      logger.child({ component: 'asker' }),
    );
    await asker.start();
  }

  // 7. Proposer + HTTP-server
  const proposer = new Proposer(router, db, verification.templates, config.proposedMappersPath, logger);
  const app = createApp({
    db,
    router,
    proposer,
    publisher,
    observer,
    asker,
    promptVerification: verification,
    logger,
    loadedAt: new Date().toISOString(),
  });

  const server = app.listen(config.port, () => {
    logger.info({ port: config.port }, 'mapping-assistant listening');
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'shutting down');
    server.close();
    await asker?.stop();
    await observer?.stop();
    await publisher.stop();
    db.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('mapping-assistant bootstrap failed', err);
  process.exit(1);
});
