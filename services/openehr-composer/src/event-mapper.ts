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
  compositionShape:
    | 'observation_time_series'
    | 'action_minimal'
    | 'evaluation_medication'
    | 'evaluation_diagnosis'
    | 'evaluation_allergy';
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
  // Medication — P3.0b Path A: medication_summary.v1 (EVALUATION).
  // viaFixture: false eftersom OPT är bridge-genererad (xmlbuilder2), inte
  // upstream-fixture.
  'core.clinical.medication.prescribed': {
    templateId: 'medication_summary.v1',
    archetypeNodeId: 'openEHR-EHR-EVALUATION.medication_summary.v1',
    compositionShape: 'evaluation_medication',
    viaFixture: false,
  },
  'core.clinical.medication.dispensed': {
    templateId: 'medication_summary.v1',
    archetypeNodeId: 'openEHR-EHR-EVALUATION.medication_summary.v1',
    compositionShape: 'evaluation_medication',
    viaFixture: false,
  },
  'core.clinical.medication.renewed': {
    templateId: 'medication_summary.v1',
    archetypeNodeId: 'openEHR-EHR-EVALUATION.medication_summary.v1',
    compositionShape: 'evaluation_medication',
    viaFixture: false,
  },
  'core.clinical.medication.discontinued': {
    templateId: 'medication_summary.v1',
    archetypeNodeId: 'openEHR-EHR-EVALUATION.medication_summary.v1',
    compositionShape: 'evaluation_medication',
    viaFixture: false,
  },
  // Condition/diagnosis — P3.0c Path A: problem_diagnosis.v1 (EVALUATION).
  'core.clinical.condition.diagnosed': {
    templateId: 'problem_diagnosis.v1',
    archetypeNodeId: 'openEHR-EHR-EVALUATION.problem_diagnosis.v1',
    compositionShape: 'evaluation_diagnosis',
    viaFixture: false,
  },
  'core.clinical.condition.updated': {
    templateId: 'problem_diagnosis.v1',
    archetypeNodeId: 'openEHR-EHR-EVALUATION.problem_diagnosis.v1',
    compositionShape: 'evaluation_diagnosis',
    viaFixture: false,
  },
  'core.clinical.condition.resolved': {
    templateId: 'problem_diagnosis.v1',
    archetypeNodeId: 'openEHR-EHR-EVALUATION.problem_diagnosis.v1',
    compositionShape: 'evaluation_diagnosis',
    viaFixture: false,
  },
  // Adverse-reaction / allergy — P3.0d Path A: adverse_reaction_risk.v2 (EVALUATION).
  'core.clinical.allergy.reported': {
    templateId: 'adverse_reaction_risk.v2',
    archetypeNodeId: 'openEHR-EHR-EVALUATION.adverse_reaction_risk.v2',
    compositionShape: 'evaluation_allergy',
    viaFixture: false,
  },
  'core.clinical.allergy.updated': {
    templateId: 'adverse_reaction_risk.v2',
    archetypeNodeId: 'openEHR-EHR-EVALUATION.adverse_reaction_risk.v2',
    compositionShape: 'evaluation_allergy',
    viaFixture: false,
  },
  'core.clinical.allergy.resolved': {
    templateId: 'adverse_reaction_risk.v2',
    archetypeNodeId: 'openEHR-EHR-EVALUATION.adverse_reaction_risk.v2',
    compositionShape: 'evaluation_allergy',
    viaFixture: false,
  },
};

/** Event-typer som fortfarande saknar template-mapping efter P3.0d.
 *  Listan är tom — alla Fru Andersson-scenariots EVALUATION-events
 *  hanteras nu av medication_summary.v1, problem_diagnosis.v1 och
 *  adverse_reaction_risk.v2. */
export const KNOWN_GAP_EVENT_TYPES: ReadonlySet<string> = new Set([]);

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
