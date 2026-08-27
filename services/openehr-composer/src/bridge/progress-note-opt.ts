// Archetype-specific OPT builder for progress_note.v1 (B4 Etapp 1, 2026-08-19).
//
// === INTERIM ARTEFACT — ersätts av designer-exporten ===================
// D7 (Spec_B4_Reversibel_Skrivvag_Anteckning_v0.1.md, reviderad 2026-08-19):
// `infra/openehr/compiler` är diagnostic-only — den producerar ingen OPT.
// Denna fil bygger i stället OPT:en programmatiskt via samma
// bridge-builder-mönster som redan används för medication_summary.v1 m.fl.
// (se ../PROVENANCE.md-diskussionen i infra/openehr/archetypes för
// bakgrunden). Ordet "compiler" i D7 omtolkas INTE — detta är en annan,
// redan existerande del av samma ADL→OPT-kedja.
//
// Spårbarhet (S11): `DEFAULT_CONCEPT` innehåller "[INTERIM]" explicit så
// att det syns direkt i EHRbase:s templatlista. Byts ut i ett testat steg
// när designer-exporten kommer (se __tests__/progress-note-opt.test.ts för
// kontraktstestet som ska överleva bytet oförändrat).
//
// Kändgap-logg: bridge-mönstret som de facto OPT-pipeline bryter Block 2:s
// löfte i Malbild_Nimloth_Nordstjarna_v0.1.md §3 att en region ska kunna
// lägga till en klinisk modell utan Northfactor — se Spec B4 kapitel 11.
// =========================================================================
//
// Produces XML-OPT 1.4 that EHRbase 2.30.1 accepts via
// POST /ehrbase/rest/openehr/v1/definition/template/adl1.4
//
// Structure (verifierad mot de faktiska ADL-filerna, Compose Etapp 1
// 2026-08-19 — infra/openehr/archetypes/openEHR-EHR-COMPOSITION.encounter.v1.adl
// rad 462-485 och openEHR-EHR-OBSERVATION.progress_note.v1.adl rad 132-163):
//   template
//     definition: COMPOSITION (openEHR-EHR-COMPOSITION.encounter.v1)
//       category: DV_CODED_TEXT bound to openehr/433 (event) — samma
//         bindning som arketypen själv redan constrainar på arketypnivå.
//       content: OBSERVATION (openEHR-EHR-OBSERVATION.progress_note.v1)
//         data: HISTORY
//           events: EVENT (any_event)
//             data: ITEM_TREE
//               items: ELEMENT × 1
//                 progress_note (at0004, DV_TEXT, required i templatet —
//                   0..1 på arketypnivå, men en tom anteckning är
//                   meningslös för B4:s syfte)
//
// encounter.v1:s `content`-attribut är obegränsat på arketypnivå (ingen
// egen slot-constraint) — progress_note.v1 droppas in direkt utan
// slot-typkonflikt, samma mekanik som laboratory-test-result-opt.ts men
// med encounter.v1 som composition-rot i stället för event_series.v1
// (valt för encounter.v1:s genuina svenska översättning, se PROVENANCE.md).
//
// Ingen svensk term finns för progress_note.v1 i mirrorn (bekräftat i
// PROVENANCE.md) — fältetiketten blir engelsk tills en översättning
// bidras uppströms till Modellbiblioteket.

import { create } from "xmlbuilder2";
import {
  cardinality,
  codePhrase,
  dvText,
  elementSlot,
  existence,
  occurrences,
} from "./opt-primitives.js";

const OPT_NAMESPACE = {
  "@xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
  "@xmlns:xsd": "http://www.w3.org/2001/XMLSchema",
  "@xmlns": "http://schemas.openehr.org/v1",
};

export interface ProgressNoteOptOpts {
  templateId?: string;
  concept?: string;
  uid?: string;
}

export const PROGRESS_NOTE_DEFAULT_TEMPLATE_ID = "progress_note.v1";
export const PROGRESS_NOTE_DEFAULT_CONCEPT =
  "Progress note [INTERIM — ersätts av designer-exporten, se Spec B4 D7]";
// Deterministic UID for byte-stable diffs across regenerations.
export const PROGRESS_NOTE_DEFAULT_UID = "7c9a1e3d-4f2b-4a11-9c8e-b4b4b4b4b401";

const ARCHETYPE_ID_OBSERVATION = "openEHR-EHR-OBSERVATION.progress_note.v1";
const ARCHETYPE_ID_COMPOSITION = "openEHR-EHR-COMPOSITION.encounter.v1";

interface ElementDef {
  nodeId: string;
  label: string;
  description: string;
  value: Record<string, unknown>;
  required?: boolean;
}

const ELEMENTS: ElementDef[] = [
  {
    nodeId: "at0004",
    label: "progress_note",
    description:
      "Free-text clinical note (INTERIM shape — designer-exporten kan lägga till struktur).",
    value: dvText(),
    required: true,
  },
];

function buildObservationTermDefinitions(
  elements: ElementDef[],
): Array<Record<string, unknown>> {
  const observationRoot = {
    "@code": "at0000",
    items: [
      { "@id": "description", "#": "Ad-hoc entry of a clinical progress note." },
      { "@id": "text", "#": "Progress note" },
    ],
  };
  const history = {
    "@code": "at0001",
    items: [
      { "@id": "description", "#": "@ internal @" },
      { "@id": "text", "#": "Event Series" },
    ],
  };
  const anyEvent = {
    "@code": "at0002",
    items: [
      { "@id": "description", "#": "*" },
      { "@id": "text", "#": "Any event" },
    ],
  };
  const itemTree = {
    "@code": "at0003",
    items: [
      { "@id": "description", "#": "@ internal @" },
      { "@id": "text", "#": "Tree" },
    ],
  };
  const perElement = elements.map((el) => ({
    "@code": el.nodeId,
    items: [
      { "@id": "description", "#": el.description },
      { "@id": "text", "#": "Progress Note" },
    ],
  }));
  return [observationRoot, history, anyEvent, itemTree, ...perElement];
}

function buildCategoryConstraint(): Record<string, unknown> {
  return {
    "@xsi:type": "C_SINGLE_ATTRIBUTE",
    rm_attribute_name: "category",
    existence: existence(),
    children: {
      "@xsi:type": "C_COMPLEX_OBJECT",
      rm_type_name: "DV_CODED_TEXT",
      occurrences: occurrences(),
      node_id: {},
      attributes: {
        "@xsi:type": "C_SINGLE_ATTRIBUTE",
        rm_attribute_name: "defining_code",
        existence: existence(),
        children: codePhrase("openehr", "433"),
      },
    },
  };
}

function buildItemTree(elements: ElementDef[]): Record<string, unknown> {
  return {
    "@xsi:type": "C_COMPLEX_OBJECT",
    rm_type_name: "ITEM_TREE",
    occurrences: occurrences(),
    node_id: "at0003",
    attributes: {
      "@xsi:type": "C_MULTIPLE_ATTRIBUTE",
      rm_attribute_name: "items",
      existence: existence({ lower: 0, upper: 1 }),
      children: elements.map((el) =>
        elementSlot({
          nodeId: el.nodeId,
          valueChild: el.value,
          required: el.required,
        }),
      ),
      cardinality: cardinality(),
    },
  };
}

function buildEvent(elements: ElementDef[]): Record<string, unknown> {
  return {
    "@xsi:type": "C_COMPLEX_OBJECT",
    rm_type_name: "EVENT",
    occurrences: {
      lower_included: true,
      lower_unbounded: false,
      upper_unbounded: true,
      lower: 0,
    },
    node_id: "at0002",
    attributes: {
      "@xsi:type": "C_SINGLE_ATTRIBUTE",
      rm_attribute_name: "data",
      existence: existence(),
      children: buildItemTree(elements),
    },
  };
}

function buildHistory(elements: ElementDef[]): Record<string, unknown> {
  return {
    "@xsi:type": "C_COMPLEX_OBJECT",
    rm_type_name: "HISTORY",
    occurrences: occurrences(),
    node_id: "at0001",
    attributes: {
      "@xsi:type": "C_MULTIPLE_ATTRIBUTE",
      rm_attribute_name: "events",
      existence: existence({ lower: 0, upper: 1 }),
      children: buildEvent(elements),
      cardinality: cardinality({ lower: 1, upper: Infinity }),
    },
  };
}

function buildObservationContent(elements: ElementDef[]): Record<string, unknown> {
  return {
    "@xsi:type": "C_ARCHETYPE_ROOT",
    rm_type_name: "OBSERVATION",
    occurrences: {
      lower_included: true,
      lower_unbounded: false,
      upper_unbounded: true,
      lower: 0,
    },
    node_id: "at0000",
    attributes: {
      "@xsi:type": "C_SINGLE_ATTRIBUTE",
      rm_attribute_name: "data",
      existence: existence(),
      children: buildHistory(elements),
    },
    archetype_id: { value: ARCHETYPE_ID_OBSERVATION },
    term_definitions: buildObservationTermDefinitions(elements),
  };
}

function buildContentConstraint(elements: ElementDef[]): Record<string, unknown> {
  return {
    "@xsi:type": "C_MULTIPLE_ATTRIBUTE",
    rm_attribute_name: "content",
    existence: existence({ lower: 0, upper: 1 }),
    children: buildObservationContent(elements),
    cardinality: cardinality(),
  };
}

function buildDefinition(
  elements: ElementDef[],
  templateId: string,
): Record<string, unknown> {
  return {
    rm_type_name: "COMPOSITION",
    occurrences: occurrences(),
    node_id: "at0000",
    attributes: [buildCategoryConstraint(), buildContentConstraint(elements)],
    archetype_id: { value: ARCHETYPE_ID_COMPOSITION },
    template_id: { value: templateId },
    term_definitions: [
      {
        "@code": "at0000",
        items: [
          { "@id": "description", "#": "A generic encounter." },
          { "@id": "text", "#": "Encounter" },
        ],
      },
    ],
  };
}

function buildLanguage(): Record<string, unknown> {
  return {
    terminology_id: { value: "ISO_639-1" },
    code_string: "sv",
  };
}

function buildDescription(): Record<string, unknown> {
  const otherDetailKeys = [
    "MetaDataSet:Sample Set ",
    "Acknowledgements",
    "Business Process Level",
    "Care setting",
    "Client group",
    "Clinical Record Element",
    "Copyright",
    "Issues",
    "Owner",
    "Sign off",
    "Speciality",
    "User roles",
  ];
  return {
    original_author: { "@id": "Original Author", "#": "Northfactor" },
    lifecycle_state: "Initial",
    other_details: otherDetailKeys.map((id) => ({ "@id": id, "#": "" })),
    details: {
      language: buildLanguage(),
      purpose:
        "INTERIM progress-note-mall genererad av Nimloth Core B4-bridgen (2026-08-19). " +
        "Ersätts av designer-exporten i ett testat steg — se Spec_B4_Reversibel_Skrivvag_Anteckning_v0.1.md, D7.",
    },
  };
}

export function buildProgressNoteOpt(opts: ProgressNoteOptOpts = {}): string {
  const templateId = opts.templateId ?? PROGRESS_NOTE_DEFAULT_TEMPLATE_ID;
  const concept = opts.concept ?? PROGRESS_NOTE_DEFAULT_CONCEPT;
  const uid = opts.uid ?? PROGRESS_NOTE_DEFAULT_UID;

  const doc = {
    template: {
      ...OPT_NAMESPACE,
      language: buildLanguage(),
      description: buildDescription(),
      uid: { value: uid },
      template_id: { value: templateId },
      concept,
      definition: buildDefinition(ELEMENTS, templateId),
    },
  };

  return create({ version: "1.0", encoding: "utf-8" }, doc).end({
    prettyPrint: true,
  });
}

export { ELEMENTS as PROGRESS_NOTE_ELEMENTS };
