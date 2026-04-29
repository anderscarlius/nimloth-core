#!/usr/bin/env node
// CLI: kafka-test-producer <command>
//
// Kommandon:
//   fru-andersson    — skicka 6 events (Fru Anderssons akutankomst)
//   single <type>    — skicka ett enskilt event (för debugging)

import { Kafka } from 'kafkajs';
import {
  fruAnderssonEmergencySequence,
  bodyTemperatureEvent,
  procedureCompletedEvent,
  medicationPrescribedEvent,
  deriveTopic,
  type ClinicalEvent,
} from './scenarios.js';

const command = process.argv[2];

const kafka = new Kafka({
  clientId: 'kafka-test-producer',
  brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(',').map((s) => s.trim()),
});

const producer = kafka.producer();

async function send(events: ClinicalEvent[]): Promise<void> {
  await producer.connect();
  try {
    for (const event of events) {
      const topic = deriveTopic(event.event_type);
      await producer.send({
        topic,
        messages: [
          {
            key: event.patient_pnr,
            value: JSON.stringify(event),
            headers: { event_type: event.event_type, source_system: event.source_system },
          },
        ],
      });
      // eslint-disable-next-line no-console
      console.log(`✓ ${event.event_type} → ${topic} (event_id=${event.event_id})`);
    }
  } finally {
    await producer.disconnect();
  }
}

async function main(): Promise<void> {
  switch (command) {
    case 'fru-andersson': {
      const events = fruAnderssonEmergencySequence();
      console.log(`Skickar ${events.length} events för Fru Andersson...`);
      await send(events);
      console.log(`Klart. ${events.length} events skickade.`);
      break;
    }
    case 'single': {
      const type = process.argv[3];
      let event: ClinicalEvent;
      switch (type) {
        case 'body_temperature':
          event = bodyTemperatureEvent(37.5);
          break;
        case 'procedure':
          event = procedureCompletedEvent('Test procedure');
          break;
        case 'medication':
          event = medicationPrescribedEvent('TestDrug', '10mg');
          break;
        default:
          console.error(`Unknown type: ${type}. Try: body_temperature | procedure | medication`);
          process.exit(2);
      }
      await send([event]);
      break;
    }
    default:
      console.error('Usage: kafka-test-producer <command>');
      console.error('Commands:');
      console.error('  fru-andersson           — 6-event akutankomst');
      console.error('  single <type>           — ett event (body_temperature|procedure|medication)');
      process.exit(1);
  }
}

main().catch((err) => {
  console.error('kafka-test-producer failed:', err);
  process.exit(1);
});
