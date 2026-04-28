// Event-mapper: avgör vilken EHRbase-template ett clinical event ska
// skrivas mot, samt vilken intern composition-template-typ
// composition-builder ska producera.
//
// Sprint 2 (P3.1) — fixture-baserad mapping:
//   * vitals (temp, BP, pulse) → time_series.en.v1 (DV_QUANTITY-stöd)
//   * procedure              → minimal_action.en.v1 (ACTION-shape)
//   * medication, allergy,
//     diagnosis              → GAP (loggat för P3.0b)
//
// När P3.0b levererar riktiga kompilerade OPT från archetypes/ kommer
// EVENT_TO_TEMPLATE-mappningen utökas. Tills dess loggar gap-tracker
// alla event-typer utan template-täckning.

import type { ClinicalEvent } from './types.js';

export interface TemplateMapping {
  /** EHRbase template-id (vad som POSTas i Header openEHR-TEMPLATE_ID). */
  templateId: string;
  /** openEHR archetype-id som content-roten refererar. */
  archetypeNodeId: string;
  /** Intern shape composition-builder bygger mot. */
  compositionShape: 'observation_time_series' | 'action_minimal';
  /** True om mapping går via fixture; false när P3.0b producerat egen OPT. */
  viaFixture: boolean;
}

const EVENT_TO_TEMPLATE: Record<string, TemplateMapping> = {
  // Vitals — alla går till time_series.en.v1 (OBSERVATION + DV_QUANTITY)
  'core.clinical.observation.vitals.body_temperature': {
    templateId: 'time_series.en.v1',
    archetypeNodeId: 'openEHR-EHR-OBSERVATION.time_series.v1',
    compositionShape: 'observation_time_series',
    viaFixture: true,
  },
  'core.clinical.observation.vitals.blood_pressure': {
    templateId: 'time_series.en.v1',
    archetypeNodeId: 'openEHR-EHR-OBSERVATION.time_series.v1',
    compositionShape: 'observation_time_series',
    viaFixture: true,
  },
  'core.clinical.observation.vitals.pulse': {
    templateId: 'time_series.en.v1',
    archetypeNodeId: 'openEHR-EHR-OBSERVATION.time_series.v1',
    compositionShape: 'observation_time_series',
    viaFixture: true,
  },
  // Procedure — går till minimal_action.en.v1 (ACTION-shape)
  'core.clinical.procedure.completed': {
    templateId: 'minimal_action.en.v1',
    archetypeNodeId: 'openEHR-EHR-ACTION.minimal.v1',
    compositionShape: 'action_minimal',
    viaFixture: true,
  },
};

/** Fru Andersson-event-typer som blockeras av fixture-täckningen.
 *  P3.0b ska leverera EVALUATION-templates för dessa. */
export const KNOWN_GAP_EVENT_TYPES: ReadonlySet<string> = new Set([
  'core.clinical.medication.prescribed',
  'core.clinical.medication.dispensed',
  'core.clinical.allergy.reported',
  'core.clinical.condition.diagnosed',
]);

export function mapEventToTemplate(event: ClinicalEvent): TemplateMapping | null {
  return EVENT_TO_TEMPLATE[event.event_type] ?? null;
}

/** För /composer/templates-endpoint. */
export function listMappings(): Array<{ event_type: string } & TemplateMapping> {
  return Object.entries(EVENT_TO_TEMPLATE).map(([event_type, mapping]) => ({
    event_type,
    ...mapping,
  }));
}

export function isKnownGap(eventType: string): boolean {
  return KNOWN_GAP_EVENT_TYPES.has(eventType);
}
