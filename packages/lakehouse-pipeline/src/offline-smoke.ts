/**
 * Offline Bronze→Silver smoke — no Kafka/Docker required (CI-friendly).
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildCompositionCommittedEvent } from '@nimloth-core/shared';
import {
  buildBronzeCompositionRecord,
  buildSilverBodyTemperatureRow,
  ClinicalVitalsCache,
  serializeBronzeLine,
  serializeSilverLine,
} from './index.js';

async function main(): Promise<void> {
  const dir = join(tmpdir(), `wp-lh1-smoke-${process.pid}`);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });

  const bronzePath = join(dir, 'bronze.ndjson');
  const silverPath = join(dir, 'silver.ndjson');

  const vitalEvent = {
    event_id: '33333333-3333-3333-3333-333333333333',
    event_type: 'core.clinical.observation.vitals.body_temperature',
    timestamp: '2026-10-01T08:00:00.000Z',
    patient_id: '19500315-2384',
    payload: { value: 36.8, units: '°C' },
  };

  const cache = new ClinicalVitalsCache();
  if (!cache.rememberFromKafkaMessage(vitalEvent)) {
    throw new Error('vitals cache rejected synthetic event');
  }

  const domain = buildCompositionCommittedEvent({
    patient_id: vitalEvent.patient_id,
    composition_uid: 'smoke-uid::ehrbase::1',
    ehr_id: '44444444-4444-4444-4444-444444444444',
    template_id: 'body_temperature.v2.p3_0b',
    trigger_event_id: vitalEvent.event_id,
    trigger_event_type: vitalEvent.event_type,
  });

  const bronze = buildBronzeCompositionRecord(domain);
  await writeFile(bronzePath, serializeBronzeLine(bronze), 'utf8');

  const vital = cache.lookupForCompositionTrigger(
    domain.payload.trigger_event_id,
    domain.payload.trigger_event_type,
  );
  if (!vital) {
    throw new Error('missing vitals join');
  }
  const silver = buildSilverBodyTemperatureRow(bronze, vital);
  await writeFile(silverPath, serializeSilverLine(silver), 'utf8');

  const bronzeText = await readFile(bronzePath, 'utf8');
  const silverText = await readFile(silverPath, 'utf8');
  if (!bronzeText.includes('"layer":"bronze"')) {
    throw new Error('bronze layer marker missing');
  }
  if (!silverText.includes('"layer":"silver"')) {
    throw new Error('silver layer marker missing');
  }
  if (!silverText.includes('/value/magnitude')) {
    throw new Error('silver openehr_path missing');
  }

  console.log(`WP_LH1_BRONZE_LINES=1`);
  console.log(`WP_LH1_SILVER_LINES=1`);
  console.log(`WP_LH1_SILVER_MAGNITUDE=${silver.magnitude}`);
  console.log(`WP_LH1_OK=1`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
