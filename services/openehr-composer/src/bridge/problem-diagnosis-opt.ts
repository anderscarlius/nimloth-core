// Archetype-specific OPT builder for problem_diagnosis.v1 (P3.0c).
//
// Mirrors P3.0b medication-summary-opt structure (Path A pattern). EHRbase
// 2.30.1 accepts the output via
// POST /ehrbase/rest/openehr/v1/definition/template/adl1.4
//
// Structure:
//   template
//     language / description / uid / template_id / concept
//     definition: COMPOSITION (openEHR-EHR-COMPOSITION.minimal.v1)
//       category: DV_CODED_TEXT bound to openehr/433 (event)
//       content: EVALUATION (openEHR-EHR-EVALUATION.problem_diagnosis.v1)
//         data: ITEM_TREE
//           items: ELEMENT × 6 (diagnosis_name, diagnosis_code, severity,
//                               date_of_onset, status, clinical_description)
//
// Terminology binding: composition-builder uses 'local' for coded fields
// to avoid EHRbase's ItemValidator NPE on unresolved rubrics — same
// workaround as medication_summary.v1 (see ccf62a4).

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

export interface ProblemDiagnosisOptOpts {
  templateId?: string;
  concept?: string;
  uid?: string;
}

export const PD_DEFAULT_TEMPLATE_ID = "problem_diagnosis.v1";
export const PD_DEFAULT_CONCEPT = "Problem diagnosis";
// Deterministic UID for byte-stable diffs across regenerations.
export const PD_DEFAULT_UID = "1d2e3f40-aabb-4ccc-9dde-eeff00112233";

const ARCHETYPE_ID_EVALUATION = "openEHR-EHR-EVALUATION.problem_diagnosis.v1";
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
    label: "diagnosis_name",
    description: "Free-text name of the problem or diagnosis.",
    value: dvText(),
    required: true,
  },
  {
    nodeId: "at0003",
    label: "diagnosis_code",
    description:
      "Coded diagnosis (ICD-10/SNOMED). Bound to 'local' until terminology services are integrated.",
    value: dvCodedText("local"),
  },
  {
    nodeId: "at0004",
    label: "severity",
    description: "Severity descriptor (e.g. mild / moderate / severe).",
    value: dvCodedText("local"),
  },
  {
    nodeId: "at0005",
    label: "date_of_onset",
    description: "Approximate date of onset.",
    value: dvDateTime(),
  },
  {
    nodeId: "at0006",
    label: "status",
    description:
      "Clinical status (e.g. active / resolved / recurrence / inactive).",
    value: dvCodedText("local"),
  },
  {
    nodeId: "at0007",
    label: "clinical_description",
    description: "Free-text narrative complementing the coded fields.",
    value: dvText(),
  },
];

function buildTermDefinitions(elements: ElementDef[]): Array<Record<string, unknown>> {
  const archetypeRoot = {
    "@code": "at0000",
    items: [
      { "@id": "description", "#": "Problem diagnosis entry." },
      { "@id": "text", "#": "Problem diagnosis" },
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
      purpose: "Problem diagnosis template generated by Nimloth P3.0c bridge.",
    },
  };
}

export function buildProblemDiagnosisOpt(opts: ProblemDiagnosisOptOpts = {}): string {
  const templateId = opts.templateId ?? PD_DEFAULT_TEMPLATE_ID;
  const concept = opts.concept ?? PD_DEFAULT_CONCEPT;
  const uid = opts.uid ?? PD_DEFAULT_UID;

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

export { ELEMENTS as PROBLEM_DIAGNOSIS_ELEMENTS };
