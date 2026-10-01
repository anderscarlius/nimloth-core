/**
 * WP-DEMO1 — publish one synthetic body_temperature vital to Kafka.
 * Used by run-aql-fhir-vitals-proof.sh (composer + materializer consumers).
 *
 * Run from repo root:
 *   pnpm exec tsx deploy/demo-slice/publish-synthetic-vital.ts --magnitude 37.42
 */
import { randomUUID } from 'node:crypto';
import { Kafka } from 'kafkajs';

const PNR = '19500315-2384';

function parseArgs(): { magnitude: number; brokers: string; topic: string } {
  const args = process.argv.slice(2);
  let magnitude = 37.42;
  let brokers = process.env.KAFKA_BROKERS_HOST ?? 'localhost:9092';
  const topic = 'core.clinical.observation.vitals';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--magnitude' && args[i + 1]) {
      magnitude = Number(args[++i]);
    } else if (args[i] === '--brokers' && args[i + 1]) {
      brokers = args[++i];
    }
  }
  if (!Number.isFinite(magnitude)) {
    throw new Error('invalid --magnitude');
  }
  return { magnitude, brokers, topic };
}

async function main(): Promise<void> {
  const { magnitude, brokers, topic } = parseArgs();
  const eventId = randomUUID();
  const now = new Date().toISOString();

  const event = {
    event_id: eventId,
    event_type: 'core.clinical.observation.vitals.body_temperature',
    event_version: '1',
    timestamp: now,
    source_system: 'melior',
    source_instance: 'wp-demo1-proof',
    patient_id: PNR,
    producer_id: 'SE-DEMO-PHYSICIAN',
    pdl_context: {
      care_unit: 'SE2321000131-E000000000001',
      care_provider: 'SE-DEMO-PHYSICIAN',
      purpose: 'CARE' as const,
      legal_basis: 'PDL_2_4' as const,
    },
    correlation_id: eventId,
    payload: {
      observation_type: 'TEMPERATURE',
      value: magnitude,
      units: '°C',
      values: [
        {
          system: 'http://snomed.info/sct',
          code: '386725007',
          display: 'Body temperature',
          value: magnitude,
          unit: '°C',
        },
      ],
      recorded_at: now,
      quality_flags: [] as string[],
    },
  };

  const kafka = new Kafka({
    clientId: 'wp-demo1-vitals-publisher',
    brokers: brokers.split(',').map((b) => b.trim()),
  });
  const producer = kafka.producer();
  await producer.connect();
  await producer.send({
    topic,
    messages: [{ key: PNR, value: JSON.stringify(event) }],
  });
  await producer.disconnect();

  // Machine-readable line for bash parser
  console.log(`WP_DEMO1_EVENT_ID=${eventId}`);
  console.log(`WP_DEMO1_MAGNITUDE=${magnitude}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
