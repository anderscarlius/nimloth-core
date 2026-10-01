import { describe, expect, it } from 'vitest';
import { buildCompositionCommittedEvent } from '@nimloth-core/shared';
import {
  buildBronzeCompositionRecord,
  buildSilverBodyTemperatureRow,
  bodyTemperatureMagnitudePath,
  canBuildSilverBodyTemperature,
  ClinicalVitalsCache,
  LAKEHOUSE_DATA_CLASS,
  LAKEHOUSE_BRONZE_STORE,
} from '../index.js';

describe('WP-LH1 bronze→silver pipeline', () => {
  const vitalEvent = {
    event_id: '22222222-2222-2222-2222-222222222222',
    event_type: 'core.clinical.observation.vitals.body_temperature',
    event_version: '1',
    timestamp: '2026-10-01T12:00:00.000Z',
    source_system: 'melior',
    source_instance: 'wp-lh1-smoke',
    patient_id: '19500315-2384',
    producer_id: 'SE-DEMO-PHYSICIAN',
    correlation_id: '22222222-2222-2222-2222-222222222222',
    payload: {
      observation_type: 'TEMPERATURE',
      value: 37.42,
      units: '°C',
      values: [{ value: 37.42, unit: '°C' }],
      recorded_at: '2026-10-01T12:00:00.000Z',
      quality_flags: [],
    },
  };

  it('bronze är append-only raw med proveniens och dataklass 0', () => {
    const domain = buildCompositionCommittedEvent({
      patient_id: '19500315-2384',
      composition_uid: 'uid::ehrbase::1',
      ehr_id: '11111111-1111-1111-1111-111111111111',
      template_id: 'body_temperature.v2.p3_0b',
      trigger_event_id: vitalEvent.event_id,
      trigger_event_type: vitalEvent.event_type,
      committed_at: '2026-10-01T12:00:01.000Z',
    });
    const bronze = buildBronzeCompositionRecord(domain, '2026-10-01T12:00:02.000Z');
    expect(bronze.layer).toBe('bronze');
    expect(bronze.store).toBe(LAKEHOUSE_BRONZE_STORE);
    expect(bronze.data_class).toBe(LAKEHOUSE_DATA_CLASS);
    expect(bronze.provenance.template_id).toBe('body_temperature.v2.p3_0b');
    expect(bronze.provenance.source_system).toBe('core');
    expect(bronze.raw.event_id).toBe(domain.event_id);
  });

  it('silver tillplattar openEHR magnitude-path när vitals-cache träffar', () => {
    const cache = new ClinicalVitalsCache();
    expect(cache.rememberFromKafkaMessage(vitalEvent)).toBe(true);

    const domain = buildCompositionCommittedEvent({
      patient_id: '19500315-2384',
      composition_uid: 'uid::ehrbase::1',
      ehr_id: '11111111-1111-1111-1111-111111111111',
      template_id: 'body_temperature.v2.p3_0b',
      trigger_event_id: vitalEvent.event_id,
      trigger_event_type: vitalEvent.event_type,
    });
    const bronze = buildBronzeCompositionRecord(domain);
    expect(canBuildSilverBodyTemperature(bronze)).toBe(true);

    const vital = cache.lookupForCompositionTrigger(
      domain.payload.trigger_event_id,
      domain.payload.trigger_event_type,
    );
    expect(vital?.magnitude).toBe(37.42);

    const silver = buildSilverBodyTemperatureRow(bronze, vital!);
    expect(silver.openehr_path).toBe(bodyTemperatureMagnitudePath());
    expect(silver.magnitude).toBe(37.42);
    expect(silver.provenance.template_id).toBe('body_temperature.v2.p3_0b');
    expect(silver.data_class).toBe(0);
  });
});
