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

  it('blood_pressure maps to blood_pressure.v2.p3_0b with BP-specific node ids', () => {
    const mapping = mapEventToTemplate(
      vitalsEvent('core.clinical.observation.vitals.blood_pressure', { value: 120, units: 'mm[Hg]' }),
    );
    expect(mapping!.templateId).toBe('blood_pressure.v2.p3_0b');
    expect(mapping!.viaFixture).toBe(false);
    expect(mapping!.compositionShape).toBe('observation_p3_vitals');
    expect(mapping!.p3Observation?.nodeIds?.event).toBe('at0006');
  });

  it('pulse maps to pulse.v2.p3_0b (not time_series fixture)', () => {
    const mapping = mapEventToTemplate(
      vitalsEvent('core.clinical.observation.vitals.pulse', { value: 72, units: '/min' }),
    );
    expect(mapping!.templateId).toBe('pulse.v2.p3_0b');
    expect(mapping!.viaFixture).toBe(false);
    expect(mapping!.archetypeNodeId).toBe('openEHR-EHR-OBSERVATION.pulse.v2');
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

  it('buildComposition for blood_pressure writes systolic and diastolic in same observation', () => {
    const event = vitalsEvent('core.clinical.observation.vitals.blood_pressure', {
      value: 118,
      diastolic: 76,
      units: 'mm[Hg]',
    });
    const mapping = mapEventToTemplate(event)!;
    const gaps = new GapTracker();
    const composition = buildComposition(event, mapping, gaps);

    const content = composition.content as Array<Record<string, unknown>>;
    const history = (content[0].data as { events: Array<Record<string, unknown>> }).events[0];
    expect(history.archetype_node_id).toBe('at0006');

    const items = (
      history.data as {
        items: Array<{ archetype_node_id: string; value: { magnitude: number; units: string } }>;
      }
    ).items;
    expect(items).toHaveLength(2);
    expect(items[0].archetype_node_id).toBe('at0004');
    expect(items[0].value.magnitude).toBe(118);
    expect(items[1].archetype_node_id).toBe('at0005');
    expect(items[1].value.magnitude).toBe(76);
    expect(items[0].value.units).toBe('mm[Hg]');
    expect(items[1].value.units).toBe('mm[Hg]');
    expect(gaps.getGaps().filter((g) => g.kind === 'fixture_limitation').length).toBe(0);
  });

  it('buildComposition for blood_pressure keeps systolic-only payload backward compatible', () => {
    const event = vitalsEvent('core.clinical.observation.vitals.blood_pressure', {
      value: 130,
      units: 'mm[Hg]',
    });
    const mapping = mapEventToTemplate(event)!;
    const composition = buildComposition(event, mapping, new GapTracker());
    const items = (
      (composition.content as Array<Record<string, unknown>>)[0].data as {
        events: Array<{ data: { items: unknown[] } }>;
      }
    ).events[0].data.items;
    expect(items).toHaveLength(1);
  });
});
