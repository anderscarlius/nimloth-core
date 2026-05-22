// Archetype-specific OPT builder for medication_summary.v1 (Path A retry).
//
// Produces XML-OPT 1.4 that EHRbase 2.30.1 accepts via
// POST /ehrbase/rest/openehr/v1/definition/template/adl1.4
//
// Structure (mirrors Path C reference for COMPOSITION+EVALUATION wrapping):
//   template
//     language / description / uid / template_id / concept
//     definition: COMPOSITION (openEHR-EHR-COMPOSITION.minimal.v1)
//       category: DV_CODED_TEXT bound to openehr/433 (event)
//       content: EVALUATION (openEHR-EHR-EVALUATION.medication_summary.v1)
//         data: ITEM_TREE
//           items: ELEMENT × 6 (medication_name, atc_code, dose_description,
//                               route, start_date, clinical_indication)
//
// ATC-tolerance per Del 0 beslut 6: atc_code is DV_CODED_TEXT in the OPT but
// composition-builder degrades to DV_TEXT at composition time if ATC missing.

import { create } from "xmlbuilder2";
import {
  cardinality,
  codePhrase,
  dvCodedText,
  dvDateTime,
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

export interface MedicationSummaryOptOpts {
  /** Defaults to 'medication_summary.v1'. */
  templateId?: string;
  /** Defaults to 'Medication summary'. */
  concept?: string;
  /** Deterministic UID — defaults to the Path-C UID for byte-stable diffs. */
  uid?: string;
}

export const DEFAULT_TEMPLATE_ID = "medication_summary.v1";
export const DEFAULT_CONCEPT = "Medication summary";
export const DEFAULT_UID = "8a5e9c3b-7f12-4d6a-9e8f-3c4b1a2d5e6f";

const ARCHETYPE_ID_EVALUATION = "openEHR-EHR-EVALUATION.medication_summary.v1";
const ARCHETYPE_ID_COMPOSITION = "openEHR-EHR-COMPOSITION.minimal.v1";

interface ElementDef {
  /** at-code unique within the archetype. */
  nodeId: string;
  /** Internal label used in term_definitions/text. */
  label: string;
  description: string;
  value: Record<string, unknown>;
  required?: boolean;
}

const ELEMENTS: ElementDef[] = [
  {
    nodeId: "at0002",
    label: "medication_name",
    description: "Free-text name of the medication.",
    value: dvText(),
    required: true,
  },
  {
    nodeId: "at0003",
    label: "atc_code",
    description: "ATC classification. Degrades to DV_TEXT at composition time if absent.",
    value: dvCodedText("ATC"),
  },
  {
    nodeId: "at0004",
    label: "dose_description",
    description: "Free-text dose description (e.g. '500 mg x 2').",
    value: dvText(),
  },
  {
    nodeId: "at0005",
    label: "route",
    description: "Route of administration, openEHR code.",
    value: dvCodedText("openehr"),
  },
  {
    nodeId: "at0006",
    label: "start_date",
    description: "Date the medication was initiated.",
    value: dvDateTime(),
  },
  {
    nodeId: "at0007",
    label: "clinical_indication",
    description: "Free-text indication (e.g. 'antikoagulation').",
    value: dvText(),
  },
];

function buildTermDefinitions(elements: ElementDef[]): Array<Record<string, unknown>> {
  const archetypeRoot = {
    "@code": "at0000",
    items: [
      { "@id": "description", "#": "Medication summary entry." },
      { "@id": "text", "#": "Medication summary" },
    ],
  };
  const itemTree = {
    "@code": "at0001",
    items: [
      { "@id": "description", "#": "@ internal @" },
      { "@id": "text", "#": "Tree" },
    ],
  };
  const perElement = elements.map((el) => ({
    "@code": el.nodeId,
    items: [
      { "@id": "description", "#": el.description },
      { "@id": "text", "#": el.label },
    ],
  }));
  return [archetypeRoot, itemTree, ...perElement];
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
    node_id: "at0001",
    attributes: {
      "@xsi:type": "C_MULTIPLE_ATTRIBUTE",
      rm_attribute_name: "items",
      existence: existence({ lower: 0, upper: 1 }),
      children: elements.map((el) => elementSlot({ nodeId: el.nodeId, valueChild: el.value, required: el.required })),
      cardinality: cardinality(),
    },
  };
}

function buildEvaluationContent(elements: ElementDef[]): Record<string, unknown> {
  return {
    "@xsi:type": "C_ARCHETYPE_ROOT",
    rm_type_name: "EVALUATION",
    occurrences: { lower_included: true, lower_unbounded: false, upper_unbounded: true, lower: 0 },
    node_id: "at0000",
    attributes: {
      "@xsi:type": "C_SINGLE_ATTRIBUTE",
      rm_attribute_name: "data",
      existence: existence(),
      children: buildItemTree(elements),
    },
    archetype_id: { value: ARCHETYPE_ID_EVALUATION },
    term_definitions: buildTermDefinitions(elements),
  };
}

function buildContentConstraint(elements: ElementDef[]): Record<string, unknown> {
  return {
    "@xsi:type": "C_MULTIPLE_ATTRIBUTE",
    rm_attribute_name: "content",
    existence: existence({ lower: 0, upper: 1 }),
    children: buildEvaluationContent(elements),
    cardinality: cardinality(),
  };
}

function buildDefinition(elements: ElementDef[], templateId: string): Record<string, unknown> {
  return {
    rm_type_name: "COMPOSITION",
    occurrences: occurrences(),
    node_id: "at0000",
    attributes: [buildCategoryConstraint(), buildContentConstraint(elements)],
    archetype_id: { value: ARCHETYPE_ID_COMPOSITION },
    template_id: { value: templateId },
    term_definitions: {
      "@code": "at0000",
      items: [
        { "@id": "description", "#": "unknown" },
        { "@id": "text", "#": "Minimal" },
      ],
    },
  };
}

function buildLanguage(): Record<string, unknown> {
  return {
    terminology_id: { value: "ISO_639-1" },
    code_string: "en",
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
      purpose: "Medication summary template generated by Nimloth P3.0b bridge (Path A).",
    },
  };
}

export function buildMedicationSummaryOpt(opts: MedicationSummaryOptOpts = {}): string {
  const templateId = opts.templateId ?? DEFAULT_TEMPLATE_ID;
  const concept = opts.concept ?? DEFAULT_CONCEPT;
  const uid = opts.uid ?? DEFAULT_UID;

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

  return create({ version: "1.0", encoding: "utf-8" }, doc).end({ prettyPrint: true });
}

export { ELEMENTS as MEDICATION_SUMMARY_ELEMENTS };
