import { describe, expect, it } from 'vitest';
import { mapEventToTemplate } from '../event-mapper.js';
import { buildComposition } from '../composition-builder.js';
import { GapTracker } from '../gap-tracker.js';
import type { ClinicalEvent } from '../types.js';

function vitalsEvent(
  eventType: string,
  payload: Record<string, unknown>,
): ClinicalEvent {
  return {
    event_id: 'test-event-id',
    event_type: eventType,
    patient_id: '19500315-2384',
    source_system: 'unit-test',
    timestamp: '2026-04-28T08:00:00Z',
    payload,
  };
}

describe('vitals → compiler OPT mapping', () => {
  it('body_temperature maps to body_temperature.v2.p3_0b (not time_series fixture)', () => {
    const mapping = mapEventToTemplate(
      vitalsEvent('core.clinical.observation.vitals.body_temperature', { value: 37.2, units: '°C' }),
    );
    expect(mapping).not.toBeNull();
    expect(mapping!.templateId).toBe('body_temperature.v2.p3_0b');
    expect(mapping!.viaFixture).toBe(false);
    expect(mapping!.compositionShape).toBe('observation_p3_vitals');
    expect(mapping!.archetypeNodeId).toBe('openEHR-EHR-OBSERVATION.body_temperature.v2');
  });

  it('blood_pressure still uses time_series.en.v1 fixture', () => {
    const mapping = mapEventToTemplate(
      vitalsEvent('core.clinical.observation.vitals.blood_pressure', { value: 120, units: 'mm[Hg]' }),
    );
    expect(mapping!.templateId).toBe('time_series.en.v1');
    expect(mapping!.viaFixture).toBe(true);
  });

  it('buildComposition for body_temperature uses P3 node ids and real units', () => {
    const event = vitalsEvent('core.clinical.observation.vitals.body_temperature', {
      value: 38.1,
      units: '°C',
    });
    const mapping = mapEventToTemplate(event)!;
    const gaps = new GapTracker();
    const composition = buildComposition(event, mapping, gaps);

    const details = composition.archetype_details as { template_id: { value: string } };
    expect(details.template_id.value).toBe('body_temperature.v2.p3_0b');

    const content = composition.content as Array<Record<string, unknown>>;
    const observation = content[0];
    expect(observation.archetype_node_id).toBe('openEHR-EHR-OBSERVATION.body_temperature.v2');

    const history = (observation.data as { events: Array<Record<string, unknown>> }).events[0];
    expect(history.archetype_node_id).toBe('at0003');

    const items = (
      (history.data as { items: Array<{ value: { magnitude: number; units: string } }> }).items
    );
    expect(items[0].value.magnitude).toBe(38.1);
    expect(items[0].value.units).toBe('°C');

    const fixtureGaps = gaps.getGaps().filter((g) => g.kind === 'fixture_limitation');
    expect(fixtureGaps.length).toBe(0);
  });
});
