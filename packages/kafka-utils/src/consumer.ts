// NimlothConsumer — wrapper kring kafkajs consumer som standardiserar:
//   - manual commit (autoCommit: false) — services måste explicit commita
//     efter persistent skrivning (outbox-mönster)
//   - retry-policy (initialRetryTime 300ms, retries 8)
//   - logLevel WARN för att undvika spam i produktion
//
// Designprincip: bara mekanisk Kafka-koppling. Domänlogik (parse, dispatch,
// outbox) görs av handler:n. Consumer-klassen vet inget om payload-format.

import { Kafka, type Consumer, logLevel } from 'kafkajs';
import type { ConsumerConfig, MessageHandler } from './types.js';

export class NimlothConsumer {
  private readonly kafka: Kafka;
  private readonly consumer: Consumer;
  private running = false;

  constructor(private readonly config: ConsumerConfig) {
    this.kafka = new Kafka({
      clientId: config.clientId,
      brokers: config.brokers,
      logLevel: logLevel.WARN,
      retry: {
        initialRetryTime: 300,
        retries: 8,
      },
    });
    this.consumer = this.kafka.consumer({
      groupId: config.groupId,
      sessionTimeout: config.sessionTimeout ?? 30_000,
      heartbeatInterval: config.heartbeatInterval ?? 3_000,
    });
  }

  /**
   * Anslut + prenumerera + börja konsumera.
   *
   * autoCommit är AV: handler:n måste explicit anropa {@link commit} efter
   * att eventet är persistent någonstans (outbox eller motsvarande). Detta
   * är core-mekanismen i exactly-once-effekten.
   */
  async start(handler: MessageHandler): Promise<void> {
    if (this.running) throw new Error('NimlothConsumer already running');
    await this.consumer.connect();
    for (const topic of this.config.topics) {
      await this.consumer.subscribe({
        topic,
        fromBeginning: this.config.fromBeginning ?? false,
      });
    }
    this.running = true;
    await this.consumer.run({
      autoCommit: false,
      eachMessage: async (payload) => {
        if (!this.running) return;
        await handler(payload);
      },
    });
  }

  /**
   * Manuell offset-commit. Kafka-konventionen är att commita NÄSTA offset
   * (det vi vill konsumera när vi återupptar) — inte den senast lästa.
   */
  async commit(topic: string, partition: number, offset: string): Promise<void> {
    const next = (BigInt(offset) + BigInt(1)).toString();
    await this.consumer.commitOffsets([{ topic, partition, offset: next }]);
  }

  async stop(): Promise<void> {
    this.running = false;
    await this.consumer.disconnect().catch(() => undefined);
  }

  isRunning(): boolean {
    return this.running;
  }
}
