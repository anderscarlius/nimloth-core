// Archetype-specific OPT builder for laboratory_test_result.v1 (P3.0e).
//
// Produces XML-OPT 1.4 that EHRbase 2.30.1 accepts via
// POST /ehrbase/rest/openehr/v1/definition/template/adl1.4
//
// Structure:
//   template
//     definition: COMPOSITION (openEHR-EHR-COMPOSITION.event_series.v1)
//       category: DV_CODED_TEXT bound to openehr/433 (event)
//       content: OBSERVATION (openEHR-EHR-OBSERVATION.laboratory_test_result.v1)
//         data: HISTORY
//           events: EVENT (any_event)
//             data: ITEM_TREE
//               items: ELEMENT × 7
//                 analyte_name (DV_TEXT, required)
//                 analyte_code (DV_CODED_TEXT 'local', optional)
//                 analyte_result (DV_QUANTITY, required, free unit)
//                 reference_range_low (DV_QUANTITY, optional, free unit)
//                 reference_range_high (DV_QUANTITY, optional, free unit)
//                 specimen (DV_TEXT, optional)
//                 result_comment (DV_TEXT, optional)
//
// FLAT-prefix becomes `event_series` (shared with time_series.en.v1), but
// inner paths diverge via the OBSERVATION archetype tag:
//   event_series/laboratory_test_result:0/any_event:0/analyte_result|magnitude
//
// DV_QUANTITY is intentionally unconstrained on unit so HbA1c (mmol/mol),
// creatinine (µmol/L), TSH (mIU/L) all flow through the same template.
//
// === CONSUMER CONTRACT (SDG-10 INVARIANTS) ============================
// INVARIANT 1 (composer): one measurement per composition. Every lab_result
//   event is its own composition with ctx/time = sample-collection time.
//   NEVER stack multiple any_event:N in one composition — c/context/start_time
//   collapses and AQL-10/14 (lab-trend windows) regress to ~0. Verified live
//   under SDG-09 Del 1 AC4 ("Path B").
// INVARIANT 2 (consumer): downstream queries MUST discriminate lab_result
//   compositions by template_id ('laboratory_test_result.v1') or by the
//   OBSERVATION archetype ('openEHR-EHR-OBSERVATION.laboratory_test_result.v1').
//   The composition FLAT-prefix `event_series` is SHARED with time_series.en.v1
//   and is NOT a reliable discriminator. Filtering by prefix will mix lab
//   results with non-lab time series.
// =====================================================================
//
// Future terminology binding (out of scope for SDG-10 / P3.0e):
//   - analyte_code: bind from 'local' → NPU + LOINC (HbA1c = NPU NPU03835 /
//     LOINC 26464-8). Will need composer-side code-list lookup.
//   - DV_QUANTITY unit: leave free in the OPT — units are clinically
//     determined per analyte, not template-determined.
//   - Consider migrating to openEHR-EHR-COMPOSITION.report-result.v1 as the
//     idiomatic lab-report container when terminology layer lands.

import { create } from "xmlbuilder2";
import {
  cardinality,
  codePhrase,
  dvCodedText,
  dvQuantity,
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

export interface LaboratoryTestResultOptOpts {
  templateId?: string;
  concept?: string;
  uid?: string;
}

export const LAB_DEFAULT_TEMPLATE_ID = "laboratory_test_result.v1";
export const LAB_DEFAULT_CONCEPT = "Laboratory test result";
// Deterministic UID for byte-stable diffs across regenerations.
export const LAB_DEFAULT_UID = "2e3f4051-bbcc-4ddd-aaef-ff0011223344";

const ARCHETYPE_ID_OBSERVATION =
  "openEHR-EHR-OBSERVATION.laboratory_test_result.v1";
const ARCHETYPE_ID_COMPOSITION = "openEHR-EHR-COMPOSITION.event_series.v1";

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
    label: "analyte_name",
    description: "Free-text analyte name (e.g. 'HbA1c', 'Kreatinin').",
    value: dvText(),
    required: true,
  },
  {
    nodeId: "at0005",
    label: "analyte_code",
    description:
      "Coded analyte (NPU/SNOMED-CT/LOINC). Bound to 'local' until terminology service is wired.",
    value: dvCodedText("local"),
  },
  {
    nodeId: "at0006",
    label: "analyte_result",
    description:
      "Numeric result with unit. Unit is unconstrained so heterogeneous analytes share one template.",
    value: dvQuantity(),
    required: true,
  },
  {
    nodeId: "at0007",
    label: "reference_range_low",
    description: "Optional lower bound of the reference interval.",
    value: dvQuantity(),
  },
  {
    nodeId: "at0008",
    label: "reference_range_high",
    description: "Optional upper bound of the reference interval.",
    value: dvQuantity(),
  },
  {
    nodeId: "at0009",
    label: "specimen",
    description: "Sample type free-text (e.g. 'Whole blood', 'Serum', 'Urine').",
    value: dvText(),
  },
  {
    nodeId: "at0010",
    label: "result_comment",
    description: "Free-text narrative complementing the structured fields.",
    value: dvText(),
  },
];

function buildObservationTermDefinitions(
  elements: ElementDef[],
): Array<Record<string, unknown>> {
  const observationRoot = {
    "@code": "at0000",
    items: [
      { "@id": "description", "#": "Result of a single laboratory analyte." },
      { "@id": "text", "#": "Laboratory test result" },
    ],
  };
  const history = {
    "@code": "at0001",
    items: [
      { "@id": "description", "#": "@ internal @" },
      { "@id": "text", "#": "History" },
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
      { "@id": "text", "#": el.label },
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
          { "@id": "description", "#": "unknown" },
          { "@id": "text", "#": "Event series" },
        ],
      },
      {
        "@code": "at0001",
        items: [
          { "@id": "description", "#": "*" },
          { "@id": "text", "#": "Laboratory test result" },
        ],
      },
    ],
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
      purpose:
        "Laboratory test result template generated by Nimloth P3.0e bridge.",
    },
  };
}

export function buildLaboratoryTestResultOpt(
  opts: LaboratoryTestResultOptOpts = {},
): string {
  const templateId = opts.templateId ?? LAB_DEFAULT_TEMPLATE_ID;
  const concept = opts.concept ?? LAB_DEFAULT_CONCEPT;
  const uid = opts.uid ?? LAB_DEFAULT_UID;

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

export { ELEMENTS as LABORATORY_TEST_RESULT_ELEMENTS };
