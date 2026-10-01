import { describe, expect, it } from 'vitest';
import { buildCompositionCommittedEvent, validateEvent } from '@nimloth-core/shared';

describe('audit-sink contract gate', () => {
  it('rejects payload missing composition_uid', () => {
    const event = buildCompositionCommittedEvent({
      patient_id: '19500315-2384',
      composition_uid: 'uid::ehrbase::1',
      ehr_id: '11111111-1111-1111-1111-111111111111',
      template_id: 'body_temperature.v2.p3_0b',
      trigger_event_id: '22222222-2222-2222-2222-222222222222',
      trigger_event_type: 'core.clinical.observation.vitals.body_temperature',
    });
    const broken = {
      ...event,
      payload: { ...event.payload, composition_uid: undefined },
    };
    expect(validateEvent('compositionCommitted', broken).ok).toBe(false);
  });
});
