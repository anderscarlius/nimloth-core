// Återanvändbara typer för Nimloth Core Kafka-konsumtion.

import type { EachMessagePayload } from 'kafkajs';

export interface ConsumerConfig {
  /** Klient-id för Kafka. Bör vara service-namn. */
  clientId: string;
  /** Consumer group. Flera instanser av samma service ska dela groupId. */
  groupId: string;
  /** Kafka brokers (host:port-format). */
  brokers: string[];
  /** Topics att prenumerera på. */
  topics: string[];
  /** Sessionstimout — håll < outbox-skrivningens worst-case-tid. Default 30000. */
  sessionTimeout?: number;
  /** Heartbeat-intervall. Default 3000. */
  heartbeatInterval?: number;
  /** Konsumera från början om inga commits finns. Default false (latest). */
  fromBeginning?: boolean;
}

/** Handler-signatur för enskilda meddelanden. Anropas inifrån consumer.run(). */
export type MessageHandler = (payload: EachMessagePayload) => Promise<void>;
