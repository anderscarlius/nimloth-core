// Archetype-specific OPT builder for adverse_reaction_risk.v2 (P3.0d).
//
// Mirrors P3.0b/P3.0c Path A pattern. EHRbase 2.30.1 accepts the output
// via POST /ehrbase/rest/openehr/v1/definition/template/adl1.4
//
// Structure: COMPOSITION(minimal.v1) → EVALUATION(adverse_reaction_risk.v2)
// → ITEM_TREE → 6 ELEMENTs covering substance, criticality, manifestation,
// onset, reaction type, and free-text description.
//
// Terminology binding: 'local' for coded fields (same EHRbase
// ItemValidator NPE workaround as medication_summary + problem_diagnosis).

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

export interface AdverseReactionRiskOptOpts {
  templateId?: string;
  concept?: string;
  uid?: string;
}

export const ARR_DEFAULT_TEMPLATE_ID = "adverse_reaction_risk.v2";
export const ARR_DEFAULT_CONCEPT = "Adverse reaction risk";
export const ARR_DEFAULT_UID = "2e3f4051-bbcc-4ddd-9eee-ff0011223344";

const ARCHETYPE_ID_EVALUATION = "openEHR-EHR-EVALUATION.adverse_reaction_risk.v2";
const ARCHETYPE_ID_COMPOSITION = "openEHR-EHR-COMPOSITION.minimal.v1";

interface ElementDef {
  nodeId: string;
  label: string;
  description: string;
  value: Record<string, unknown>;
  required?: boolean;
}

const ELEMENTS: ElementDef[] = [
  {
    nodeId: "at0002",
    label: "substance_name",
    description: "Free-text name of the substance (drug, food, environmental).",
    value: dvText(),
    required: true,
  },
  {
    nodeId: "at0003",
    label: "substance_code",
    description:
      "Coded substance (ATC/SNOMED). Bound to 'local' until terminology services are integrated.",
    value: dvCodedText("local"),
  },
  {
    nodeId: "at0004",
    label: "criticality",
    description: "openEHR criticality: low / high / unable-to-assess.",
    value: dvCodedText("local"),
  },
  {
    nodeId: "at0005",
    label: "manifestation",
    description: "Free-text manifestation (e.g. 'hives', 'anaphylaxis').",
    value: dvText(),
  },
  {
    nodeId: "at0006",
    label: "onset_date",
    description: "Date of first reaction.",
    value: dvDateTime(),
  },
  {
    nodeId: "at0007",
    label: "reaction_type",
    description: "Reaction type: allergy / intolerance / propensity / contraindication.",
    value: dvCodedText("local"),
  },
];

function buildTermDefinitions(elements: ElementDef[]): Array<Record<string, unknown>> {
  const archetypeRoot = {
    "@code": "at0000",
    items: [
      { "@id": "description", "#": "Adverse reaction risk entry." },
      { "@id": "text", "#": "Adverse reaction risk" },
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
      children: elements.map((el) =>
        elementSlot({ nodeId: el.nodeId, valueChild: el.value, required: el.required }),
      ),
      cardinality: cardinality(),
    },
  };
}

function buildEvaluationContent(elements: ElementDef[]): Record<string, unknown> {
  return {
    "@xsi:type": "C_ARCHETYPE_ROOT",
    rm_type_name: "EVALUATION",
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
      purpose: "Adverse reaction risk template generated by Nimloth P3.0d bridge.",
    },
  };
}

export function buildAdverseReactionRiskOpt(opts: AdverseReactionRiskOptOpts = {}): string {
  const templateId = opts.templateId ?? ARR_DEFAULT_TEMPLATE_ID;
  const concept = opts.concept ?? ARR_DEFAULT_CONCEPT;
  const uid = opts.uid ?? ARR_DEFAULT_UID;

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

export { ELEMENTS as ADVERSE_REACTION_RISK_ELEMENTS };
