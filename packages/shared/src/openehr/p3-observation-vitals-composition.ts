/**
 * Minimal COMPOSITION JSON for P3.0b compiler OPT (body_weight / body_temperature).
 * Node ids follow CKM archetype paths (at####), matching OPT after ADL14 node-id restore.
 */

const EN_LANGUAGE = { terminology_id: { value: 'ISO_639-1' }, code_string: 'en' } as const;
const SE_TERRITORY = { terminology_id: { value: 'ISO_3166-1' }, code_string: 'SE' } as const;
const openEhrTerm = (code: string) => ({ terminology_id: { value: 'openehr' }, code_string: code });

/** Default CKM paths for body_temperature / body_weight / pulse.v2. */
export interface P3ObservationVitalsNodeIds {
  history: string;
  event: string;
  itemTree: string;
  valueElement: string;
}

const DEFAULT_P3_VITALS_NODE_IDS: P3ObservationVitalsNodeIds = {
  history: 'at0002',
  event: 'at0003',
  itemTree: 'at0001',
  valueElement: 'at0004',
};

export interface P3ObservationVitalsExtraQuantity {
  magnitude: number;
  units: string;
  valueElementName: string;
  archetypeNodeId: string;
}

export interface P3ObservationVitalsSpec {
  templateId: string;
  observationArchetypeId: string;
  /** DV_QUANTITY magnitude (synthetic, dataclass 0). */
  magnitude: number;
  units: string;
  /** ELEMENT value label in archetype (Weight / Temperature / Rate / Systolic). */
  valueElementName: string;
  conceptName: string;
  composerName?: string;
  startTime: string;
  /** Override when archetype HISTORY/EVENT paths differ (e.g. blood_pressure.v2). */
  nodeIds?: P3ObservationVitalsNodeIds;
  /** Additional DV_QUANTITY elements in the same ITEM_TREE (e.g. diastolic BP). */
  extraQuantities?: P3ObservationVitalsExtraQuantity[];
}

function buildQuantityElement(
  valueElementName: string,
  archetypeNodeId: string,
  magnitude: number,
  units: string,
): Record<string, unknown> {
  return {
    _type: 'ELEMENT',
    name: { value: valueElementName },
    archetype_node_id: archetypeNodeId,
    value: {
      _type: 'DV_QUANTITY',
      magnitude,
      units,
    },
  };
}

export function buildP3ObservationVitalsComposition(spec: P3ObservationVitalsSpec): Record<string, unknown> {
  const time = spec.startTime;
  const nodes = spec.nodeIds ?? DEFAULT_P3_VITALS_NODE_IDS;
  return {
    _type: 'COMPOSITION',
    name: { value: spec.conceptName },
    archetype_node_id: 'openEHR-EHR-COMPOSITION.minimal.v1',
    archetype_details: {
      _type: 'ARCHETYPED',
      archetype_id: { value: 'openEHR-EHR-COMPOSITION.minimal.v1' },
      template_id: { value: spec.templateId },
      rm_version: '1.0.4',
    },
    language: EN_LANGUAGE,
    territory: SE_TERRITORY,
    category: {
      _type: 'DV_CODED_TEXT',
      value: 'event',
      defining_code: openEhrTerm('433'),
    },
    composer: { _type: 'PARTY_IDENTIFIED', name: spec.composerName ?? 'Nimloth Core composer' },
    context: {
      _type: 'EVENT_CONTEXT',
      start_time: { value: time },
      setting: {
        _type: 'DV_CODED_TEXT',
        value: 'other care',
        defining_code: openEhrTerm('238'),
      },
    },
    content: [
      {
        _type: 'OBSERVATION',
        name: { value: spec.conceptName },
        archetype_node_id: spec.observationArchetypeId,
        archetype_details: {
          _type: 'ARCHETYPED',
          archetype_id: { value: spec.observationArchetypeId },
          rm_version: '1.0.4',
        },
        language: EN_LANGUAGE,
        encoding: {
          _type: 'CODE_PHRASE',
          terminology_id: { value: 'IANA_character-sets' },
          code_string: 'UTF-8',
        },
        subject: { _type: 'PARTY_SELF' },
        data: {
          _type: 'HISTORY',
          name: { value: 'history' },
          archetype_node_id: nodes.history,
          origin: { value: time },
          events: [
            {
              _type: 'POINT_EVENT',
              name: { value: 'Any event' },
              archetype_node_id: nodes.event,
              time: { value: time },
              data: {
                _type: 'ITEM_TREE',
                name: { value: 'Simple' },
                archetype_node_id: nodes.itemTree,
                items: [
                  buildQuantityElement(
                    spec.valueElementName,
                    nodes.valueElement,
                    spec.magnitude,
                    spec.units,
                  ),
                  ...(spec.extraQuantities ?? []).map((q) =>
                    buildQuantityElement(q.valueElementName, q.archetypeNodeId, q.magnitude, q.units),
                  ),
                ],
              },
            },
          ],
        },
      },
    ],
  };
}
