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
    case 'evaluation_medication':
      return buildEvaluationMedication(event, mapping, gaps, opts);
    case 'evaluation_diagnosis':
      return buildEvaluationDiagnosis(event, mapping, gaps, opts);
    case 'evaluation_allergy':
      return buildEvaluationAllergy(event, mapping, gaps, opts);
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
    case 'medication_summary.v1':
      return 'openEHR-EHR-COMPOSITION.minimal.v1';
    case 'problem_diagnosis.v1':
      return 'openEHR-EHR-COMPOSITION.minimal.v1';
    case 'adverse_reaction_risk.v2':
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
// Shape 3: evaluation_medication (medication_summary.v1)
// ============================================================
// Maps kafka-test-producer payload {drug, dose, atc_code?, route?, start_date?, indication?}
// to the 6-field EVALUATION archetype produced by the P3.0b Path A bridge.
// ATC degrades to DV_TEXT-only when missing (Del 0 beslut 6).
function buildEvaluationMedication(
  event: ClinicalEvent,
  mapping: TemplateMapping,
  gaps: GapTracker,
  opts: BuildOptions,
): Record<string, unknown> {
  const drug = readString(event.payload, 'drug') ?? readString(event.payload, 'medication_name');
  const dose = readString(event.payload, 'dose') ?? readString(event.payload, 'dose_description');
  const atcCode = readString(event.payload, 'atc_code') ?? readString(event.payload, 'atc');
  const route = readString(event.payload, 'route');
  const startDate = readString(event.payload, 'start_date') ?? event.occurred_at;
  const indication = readString(event.payload, 'indication') ?? readString(event.payload, 'clinical_indication');

  if (!drug) {
    gaps.log('unsupported_payload', event.event_type, 'missing payload.drug', ['DV_TEXT.medication_name']);
  }
  if (!atcCode) {
    gaps.log('terminology_missing', event.event_type, 'no ATC — degrading to DV_TEXT in annotation', ['DV_CODED_TEXT.atc_code']);
  }

  const items: Array<Record<string, unknown>> = [];

  // at0002 medication_name (DV_TEXT, required)
  items.push({
    _type: 'ELEMENT',
    name: { value: 'medication_name' },
    archetype_node_id: 'at0002',
    value: { _type: 'DV_TEXT', value: drug ?? 'Unspecified medication' },
  });

  // at0003 atc_code (DV_CODED_TEXT). Terminology is bound to 'local' rather
  // than 'ATC' because EHRbase doesn't ship ATC and its terminology validator
  // NPEs on unresolved rubrics. The ATC code is preserved in code_string —
  // downstream consumers can re-bind once a real ATC terminology is loaded.
  if (atcCode) {
    items.push({
      _type: 'ELEMENT',
      name: { value: 'atc_code' },
      archetype_node_id: 'at0003',
      value: {
        _type: 'DV_CODED_TEXT',
        value: atcCode,
        defining_code: {
          _type: 'CODE_PHRASE',
          terminology_id: { value: 'local' },
          code_string: atcCode,
        },
      },
    });
  }

  // at0004 dose_description (DV_TEXT)
  if (dose) {
    items.push({
      _type: 'ELEMENT',
      name: { value: 'dose_description' },
      archetype_node_id: 'at0004',
      value: { _type: 'DV_TEXT', value: dose },
    });
  }

  // at0005 route (DV_CODED_TEXT). 'local' terminology for same reason as
  // atc_code — EHRbase validator NPEs on unknown rubrics.
  if (route) {
    items.push({
      _type: 'ELEMENT',
      name: { value: 'route' },
      archetype_node_id: 'at0005',
      value: {
        _type: 'DV_CODED_TEXT',
        value: route,
        defining_code: {
          _type: 'CODE_PHRASE',
          terminology_id: { value: 'local' },
          code_string: route,
        },
      },
    });
  }

  // at0006 start_date (DV_DATE_TIME)
  items.push({
    _type: 'ELEMENT',
    name: { value: 'start_date' },
    archetype_node_id: 'at0006',
    value: { _type: 'DV_DATE_TIME', value: startDate },
  });

  // at0007 clinical_indication (DV_TEXT)
  if (indication) {
    items.push({
      _type: 'ELEMENT',
      name: { value: 'clinical_indication' },
      archetype_node_id: 'at0007',
      value: { _type: 'DV_TEXT', value: indication },
    });
  }

  return {
    ...commonHeader(event, mapping, opts, 'Medication summary'),
    content: [
      {
        _type: 'EVALUATION',
        name: { value: 'Medication summary' },
        archetype_details: {
          _type: 'ARCHETYPED',
          archetype_id: { value: mapping.archetypeNodeId },
          rm_version: '1.0.4',
        },
        archetype_node_id: mapping.archetypeNodeId,
        language: EN_LANGUAGE,
        encoding: { terminology_id: { value: 'IANA_character-sets' }, code_string: 'UTF-8' },
        subject: { _type: 'PARTY_SELF' },
        data: {
          _type: 'ITEM_TREE',
          name: { value: 'Tree' },
          archetype_node_id: 'at0001',
          items,
        },
      },
    ],
  };
}

// ============================================================
// Shape 4: evaluation_diagnosis (problem_diagnosis.v1) — P3.0c
// ============================================================
// Maps payload {diagnosis_name|name, diagnosis_code|icd10|snomed?,
// severity?, date_of_onset?, status?, clinical_description|description?}
// to the 6-field EVALUATION archetype produced by P3.0c Path A.
// All coded fields use 'local' terminology — see ccf62a4 for the
// EHRbase ItemValidator NPE workaround.
function buildEvaluationDiagnosis(
  event: ClinicalEvent,
  mapping: TemplateMapping,
  gaps: GapTracker,
  opts: BuildOptions,
): Record<string, unknown> {
  const name =
    readString(event.payload, 'diagnosis_name') ?? readString(event.payload, 'name');
  const code =
    readString(event.payload, 'diagnosis_code') ??
    readString(event.payload, 'icd10') ??
    readString(event.payload, 'snomed');
  const severity = readString(event.payload, 'severity');
  const onset =
    readString(event.payload, 'date_of_onset') ?? event.occurred_at;
  const status = readString(event.payload, 'status');
  const description =
    readString(event.payload, 'clinical_description') ??
    readString(event.payload, 'description');

  if (!name) {
    gaps.log('unsupported_payload', event.event_type, 'missing payload.diagnosis_name', ['DV_TEXT.diagnosis_name']);
  }
  if (!code) {
    gaps.log('terminology_missing', event.event_type, 'no ICD/SNOMED code — coded field omitted', ['DV_CODED_TEXT.diagnosis_code']);
  }

  const items: Array<Record<string, unknown>> = [];

  // at0002 diagnosis_name (required)
  items.push({
    _type: 'ELEMENT',
    name: { value: 'diagnosis_name' },
    archetype_node_id: 'at0002',
    value: { _type: 'DV_TEXT', value: name ?? 'Unspecified diagnosis' },
  });

  // at0003 diagnosis_code (optional, DV_CODED_TEXT bound to 'local')
  if (code) {
    items.push({
      _type: 'ELEMENT',
      name: { value: 'diagnosis_code' },
      archetype_node_id: 'at0003',
      value: {
        _type: 'DV_CODED_TEXT',
        value: code,
        defining_code: {
          _type: 'CODE_PHRASE',
          terminology_id: { value: 'local' },
          code_string: code,
        },
      },
    });
  }

  // at0004 severity (optional)
  if (severity) {
    items.push({
      _type: 'ELEMENT',
      name: { value: 'severity' },
      archetype_node_id: 'at0004',
      value: {
        _type: 'DV_CODED_TEXT',
        value: severity,
        defining_code: {
          _type: 'CODE_PHRASE',
          terminology_id: { value: 'local' },
          code_string: severity,
        },
      },
    });
  }

  // at0005 date_of_onset (DV_DATE_TIME — always populated, fallback to event time)
  items.push({
    _type: 'ELEMENT',
    name: { value: 'date_of_onset' },
    archetype_node_id: 'at0005',
    value: { _type: 'DV_DATE_TIME', value: onset },
  });

  // at0006 status (optional)
  if (status) {
    items.push({
      _type: 'ELEMENT',
      name: { value: 'status' },
      archetype_node_id: 'at0006',
      value: {
        _type: 'DV_CODED_TEXT',
        value: status,
        defining_code: {
          _type: 'CODE_PHRASE',
          terminology_id: { value: 'local' },
          code_string: status,
        },
      },
    });
  }

  // at0007 clinical_description (optional)
  if (description) {
    items.push({
      _type: 'ELEMENT',
      name: { value: 'clinical_description' },
      archetype_node_id: 'at0007',
      value: { _type: 'DV_TEXT', value: description },
    });
  }

  return {
    ...commonHeader(event, mapping, opts, 'Problem diagnosis'),
    content: [
      {
        _type: 'EVALUATION',
        name: { value: 'Problem diagnosis' },
        archetype_details: {
          _type: 'ARCHETYPED',
          archetype_id: { value: mapping.archetypeNodeId },
          rm_version: '1.0.4',
        },
        archetype_node_id: mapping.archetypeNodeId,
        language: EN_LANGUAGE,
        encoding: { terminology_id: { value: 'IANA_character-sets' }, code_string: 'UTF-8' },
        subject: { _type: 'PARTY_SELF' },
        data: {
          _type: 'ITEM_TREE',
          name: { value: 'Tree' },
          archetype_node_id: 'at0001',
          items,
        },
      },
    ],
  };
}

// ============================================================
// Shape 5: evaluation_allergy (adverse_reaction_risk.v2) — P3.0d
// ============================================================
// Maps payload {substance|substance_name, substance_code?, criticality?,
// manifestation?, onset_date?, reaction_type?} to the 6-field EVALUATION
// archetype produced by P3.0d Path A. Coded fields bound to 'local'.
function buildEvaluationAllergy(
  event: ClinicalEvent,
  mapping: TemplateMapping,
  gaps: GapTracker,
  opts: BuildOptions,
): Record<string, unknown> {
  const substance =
    readString(event.payload, 'substance_name') ??
    readString(event.payload, 'substance') ??
    readString(event.payload, 'allergen');
  const substanceCode =
    readString(event.payload, 'substance_code') ??
    readString(event.payload, 'atc') ??
    readString(event.payload, 'snomed');
  const criticality = readString(event.payload, 'criticality');
  const manifestation =
    readString(event.payload, 'manifestation') ?? readString(event.payload, 'reaction');
  const onset =
    readString(event.payload, 'onset_date') ?? event.occurred_at;
  const reactionType =
    readString(event.payload, 'reaction_type') ?? readString(event.payload, 'category');

  if (!substance) {
    gaps.log('unsupported_payload', event.event_type, 'missing payload.substance_name', [
      'DV_TEXT.substance_name',
    ]);
  }
  if (!substanceCode) {
    gaps.log('terminology_missing', event.event_type, 'no ATC/SNOMED code — coded field omitted', [
      'DV_CODED_TEXT.substance_code',
    ]);
  }

  const items: Array<Record<string, unknown>> = [];

  items.push({
    _type: 'ELEMENT',
    name: { value: 'substance_name' },
    archetype_node_id: 'at0002',
    value: { _type: 'DV_TEXT', value: substance ?? 'Unspecified substance' },
  });

  if (substanceCode) {
    items.push({
      _type: 'ELEMENT',
      name: { value: 'substance_code' },
      archetype_node_id: 'at0003',
      value: {
        _type: 'DV_CODED_TEXT',
        value: substanceCode,
        defining_code: {
          _type: 'CODE_PHRASE',
          terminology_id: { value: 'local' },
          code_string: substanceCode,
        },
      },
    });
  }

  if (criticality) {
    items.push({
      _type: 'ELEMENT',
      name: { value: 'criticality' },
      archetype_node_id: 'at0004',
      value: {
        _type: 'DV_CODED_TEXT',
        value: criticality,
        defining_code: {
          _type: 'CODE_PHRASE',
          terminology_id: { value: 'local' },
          code_string: criticality,
        },
      },
    });
  }

  if (manifestation) {
    items.push({
      _type: 'ELEMENT',
      name: { value: 'manifestation' },
      archetype_node_id: 'at0005',
      value: { _type: 'DV_TEXT', value: manifestation },
    });
  }

  items.push({
    _type: 'ELEMENT',
    name: { value: 'onset_date' },
    archetype_node_id: 'at0006',
    value: { _type: 'DV_DATE_TIME', value: onset },
  });

  if (reactionType) {
    items.push({
      _type: 'ELEMENT',
      name: { value: 'reaction_type' },
      archetype_node_id: 'at0007',
      value: {
        _type: 'DV_CODED_TEXT',
        value: reactionType,
        defining_code: {
          _type: 'CODE_PHRASE',
          terminology_id: { value: 'local' },
          code_string: reactionType,
        },
      },
    });
  }

  return {
    ...commonHeader(event, mapping, opts, 'Adverse reaction risk'),
    content: [
      {
        _type: 'EVALUATION',
        name: { value: 'Adverse reaction risk' },
        archetype_details: {
          _type: 'ARCHETYPED',
          archetype_id: { value: mapping.archetypeNodeId },
          rm_version: '1.0.4',
        },
        archetype_node_id: mapping.archetypeNodeId,
        language: EN_LANGUAGE,
        encoding: { terminology_id: { value: 'IANA_character-sets' }, code_string: 'UTF-8' },
        subject: { _type: 'PARTY_SELF' },
        data: {
          _type: 'ITEM_TREE',
          name: { value: 'Tree' },
          archetype_node_id: 'at0001',
          items,
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
