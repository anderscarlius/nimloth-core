/**
 * Minimal synthetic COMPOSITION for P3.0b compiler OPT (body_weight / body_temperature).
 * Node ids follow CKM archetype paths (at####), matching OPT after ADL14 node-id restore.
 */

const EN_LANGUAGE = { terminology_id: { value: 'ISO_639-1' }, code_string: 'en' } as const;
const SE_TERRITORY = { terminology_id: { value: 'ISO_3166-1' }, code_string: 'SE' } as const;
const openEhrTerm = (code: string) => ({ terminology_id: { value: 'openehr' }, code_string: code });

export interface P3ObservationVitalsSpec {
  templateId: string;
  observationArchetypeId: string;
  /** DV_QUANTITY magnitude (synthetic, dataclass 0). */
  magnitude: number;
  units: string;
  /** ELEMENT[at0004] label in archetype (Weight / Temperature). */
  valueElementName: string;
  conceptName: string;
  composerName?: string;
  startTime: string;
}

export function buildP3ObservationVitalsComposition(spec: P3ObservationVitalsSpec): Record<string, unknown> {
  const time = spec.startTime;
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
    composer: { _type: 'PARTY_IDENTIFIED', name: spec.composerName ?? 'MF2 CI synthetic' },
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
        // P3.0b OPT slots use at0000 on C_ARCHETYPE_ROOT; EHRbase matches content by slot node_id.
        archetype_node_id: 'at0000',
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
          archetype_node_id: 'at0002',
          origin: { value: time },
          events: [
            {
              // RM abstract EVENT — EHRbase canonical JSON requires a concrete subtype.
              _type: 'POINT_EVENT',
              name: { value: 'Any event' },
              archetype_node_id: 'at0003',
              time: { value: time },
              data: {
                _type: 'ITEM_TREE',
                name: { value: 'Simple' },
                archetype_node_id: 'at0001',
                items: [
                  {
                    _type: 'ELEMENT',
                    name: { value: spec.valueElementName },
                    archetype_node_id: 'at0004',
                    value: {
                      _type: 'DV_QUANTITY',
                      magnitude: spec.magnitude,
                      units: spec.units,
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    ],
  };
}
