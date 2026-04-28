// Composition-builder: producerar EHRbase-accepterbar CANONICAL JSON
// från ett ClinicalEvent + TemplateMapping.
//
// Baserat på fixturernas struktur (P3.0):
//
//   time_series.en.v1 (event_series.v1 → OBSERVATION → HISTORY → EVENT → ITEM_TREE → ELEMENT → DV_QUANTITY)
//   minimal_action.en.v1 (minimal.v1 → ACTION → ISM_TRANSITION + ITEM_TREE → ELEMENT → DV_MULTIMEDIA)
//
// Varje shape har sin egen build-funktion. Gemensamma fält (composer,
// context, language, territory) genereras av helpers nedan.
//
// Constraint-räkning: när ELEMENT byggs registreras värde-typen
// (DV_QUANTITY, DV_CODED_TEXT etc) hos GapTracker så P3.1-rapporten
// kan svara på fråga 1 från sektion 8.3.

import type { ClinicalEvent } from './types.js';
import type { TemplateMapping } from './event-mapper.js';
import type { GapTracker } from './gap-tracker.js';

const SE_TERRITORY = { terminology_id: { value: 'ISO_3166-1' }, code_string: 'SE' } as const;
const EN_LANGUAGE = { terminology_id: { value: 'ISO_639-1' }, code_string: 'en' } as const;
const OPENEHR_TERM = (code: string) => ({ terminology_id: { value: 'openehr' }, code_string: code });

export interface BuildOptions {
  composerName?: string;
  /** ISO datetime — default = event.occurred_at. */
  startTime?: string;
}

export function buildComposition(
  event: ClinicalEvent,
  mapping: TemplateMapping,
  gaps: GapTracker,
  opts: BuildOptions = {},
): Record<string, unknown> {
  switch (mapping.compositionShape) {
    case 'observation_time_series':
      return buildObservationTimeSeries(event, mapping, gaps, opts);
    case 'action_minimal':
      return buildActionMinimal(event, mapping, gaps, opts);
  }
}

// ============================================================
// Gemensamma fält
// ============================================================
function commonHeader(event: ClinicalEvent, mapping: TemplateMapping, opts: BuildOptions, conceptName: string) {
  return {
    _type: 'COMPOSITION',
    name: { value: conceptName },
    archetype_details: {
      _type: 'ARCHETYPED',
      archetype_id: { value: archetypeIdForTemplate(mapping.templateId) },
      template_id: { value: mapping.templateId },
      rm_version: '1.0.4',
    },
    archetype_node_id: archetypeIdForTemplate(mapping.templateId),
    language: EN_LANGUAGE,
    territory: SE_TERRITORY,
    category: {
      _type: 'DV_CODED_TEXT',
      value: 'event',
      defining_code: OPENEHR_TERM('433'),
    },
    composer: {
      _type: 'PARTY_IDENTIFIED',
      name: opts.composerName ?? 'Nimloth Core composer',
    },
    context: {
      _type: 'EVENT_CONTEXT',
      start_time: { value: opts.startTime ?? event.occurred_at },
      setting: {
        _type: 'DV_CODED_TEXT',
        value: 'other care',
        defining_code: OPENEHR_TERM('238'),
      },
    },
  };
}

/** EHRbase använder COMPOSITION-arketyp-id för archetype_details. Hämtas från fixtures. */
function archetypeIdForTemplate(templateId: string): string {
  switch (templateId) {
    case 'time_series.en.v1':
      return 'openEHR-EHR-COMPOSITION.event_series.v1';
    case 'minimal_action.en.v1':
      return 'openEHR-EHR-COMPOSITION.minimal.v1';
    default:
      return `openEHR-EHR-COMPOSITION.${templateId}`;
  }
}

// ============================================================
// Shape 1: observation_time_series (vitals)
// ============================================================
function buildObservationTimeSeries(
  event: ClinicalEvent,
  mapping: TemplateMapping,
  gaps: GapTracker,
  opts: BuildOptions,
): Record<string, unknown> {
  const magnitude = readNumber(event.payload, 'value');
  const requestedUnits = readString(event.payload, 'units') ?? unitsForEventType(event.event_type);
  const time = readString(event.payload, 'time') ?? event.occurred_at;

  if (magnitude == null) {
    gaps.log('unsupported_payload', event.event_type, 'missing payload.value (number)', ['DV_QUANTITY.magnitude']);
  }

  // FIXTURE-LIMITATION: time_series.en.v1 har hård units-constraint = "mm3".
  // Detta är ett exempel på varför P3.0b behövs — riktiga BP/pulse/temp-templates
  // ska bindas till respektive units (mm[Hg], /min, °C). Tills dess loggar vi
  // gap och skickar mm3 som placeholder-units så composition accepteras.
  const FIXTURE_FORCED_UNITS = 'mm3';
  if (requestedUnits && requestedUnits !== FIXTURE_FORCED_UNITS) {
    gaps.log(
      'fixture_limitation',
      event.event_type,
      `time_series.en.v1 forcerar units=${FIXTURE_FORCED_UNITS}; requested=${requestedUnits} skickas som placeholder`,
      [`expected_units:${requestedUnits}`, 'C_DV_QUANTITY.units_constraint'],
    );
  }
  const units = FIXTURE_FORCED_UNITS;

  gaps.countConstraint('DV_QUANTITY');

  const header = commonHeader(event, mapping, opts, 'Time series');

  return {
    ...header,
    content: [
      {
        _type: 'OBSERVATION',
        name: { value: 'Time series' },
        archetype_node_id: mapping.archetypeNodeId,
        archetype_details: {
          _type: 'ARCHETYPED',
          archetype_id: { value: mapping.archetypeNodeId },
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
          archetype_node_id: 'at0001',
          origin: { value: time },
          events: [
            {
              _type: 'POINT_EVENT',
              name: { value: 'any event' },
              archetype_node_id: 'at0002',
              time: { value: time },
              data: {
                _type: 'ITEM_TREE',
                name: { value: 'tree' },
                archetype_node_id: 'at0003',
                items: [
                  {
                    _type: 'ELEMENT',
                    name: { value: 'value' },
                    archetype_node_id: 'at0004',
                    value: {
                      _type: 'DV_QUANTITY',
                      magnitude: magnitude ?? 0,
                      units: units ?? '1',
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

// ============================================================
// Shape 2: action_minimal (procedure)
// ============================================================
function buildActionMinimal(
  event: ClinicalEvent,
  mapping: TemplateMapping,
  gaps: GapTracker,
  opts: BuildOptions,
): Record<string, unknown> {
  const description = readString(event.payload, 'description') ?? readString(event.payload, 'name') ?? 'Unspecified action';
  const time = readString(event.payload, 'time') ?? event.occurred_at;

  gaps.countConstraint('DV_TEXT');
  gaps.countConstraint('ISM_TRANSITION');

  const header = commonHeader(event, mapping, opts, 'Minimal action');

  return {
    ...header,
    content: [
      {
        _type: 'ACTION',
        name: { value: 'Minimal' },
        archetype_node_id: mapping.archetypeNodeId,
        archetype_details: {
          _type: 'ARCHETYPED',
          archetype_id: { value: mapping.archetypeNodeId },
          rm_version: '1.0.4',
        },
        language: EN_LANGUAGE,
        encoding: {
          _type: 'CODE_PHRASE',
          terminology_id: { value: 'IANA_character-sets' },
          code_string: 'UTF-8',
        },
        subject: { _type: 'PARTY_SELF' },
        time: { value: time },
        ism_transition: {
          _type: 'ISM_TRANSITION',
          current_state: {
            _type: 'DV_CODED_TEXT',
            value: 'completed',
            defining_code: OPENEHR_TERM('532'),
          },
        },
        description: {
          _type: 'ITEM_TREE',
          name: { value: 'Tree' },
          archetype_node_id: 'at0001',
          items: [
            {
              _type: 'ELEMENT',
              name: { value: 'description' },
              archetype_node_id: 'at0002',
              value: { _type: 'DV_TEXT', value: description },
            },
          ],
        },
      },
    ],
  };
}

// ============================================================
// Payload-readers
// ============================================================
function readNumber(payload: Record<string, unknown>, key: string): number | null {
  const v = payload[key];
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function readString(payload: Record<string, unknown>, key: string): string | null {
  const v = payload[key];
  return typeof v === 'string' ? v : null;
}

function unitsForEventType(eventType: string): string | null {
  if (eventType.endsWith('body_temperature')) return '°C';
  if (eventType.endsWith('blood_pressure')) return 'mm[Hg]';
  if (eventType.endsWith('pulse')) return '/min';
  return null;
}
