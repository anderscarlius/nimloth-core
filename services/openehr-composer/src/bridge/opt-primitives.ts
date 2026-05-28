// Re-usable OPT-XML fragments. The OPT format is dense with cardinality/occurrence
// wrappers — these helpers cut the noise so the archetype-specific code reads
// like a clinical model description rather than XML scaffolding.

export interface CardinalityBound {
  /** Inclusive lower bound (defaults to 1). */
  lower?: number;
  /** Inclusive upper bound. `Infinity` → unbounded above. */
  upper?: number | typeof Infinity;
}

/** `<occurrences>` block — used on every constraint node. */
export function occurrences(bound: CardinalityBound = {}): Record<string, unknown> {
  const lower = bound.lower ?? 1;
  const upper = bound.upper ?? lower;
  const upperUnbounded = upper === Infinity;
  return {
    lower_included: true,
    upper_included: !upperUnbounded,
    lower_unbounded: false,
    upper_unbounded: upperUnbounded,
    lower,
    ...(upperUnbounded ? {} : { upper }),
  };
}

/** `<existence>` block — identical shape to occurrences. */
export function existence(bound: CardinalityBound = {}): Record<string, unknown> {
  return occurrences(bound);
}

/** `<cardinality>` block used on multi-attribute (items collection). */
export function cardinality(bound: CardinalityBound = { lower: 0, upper: Infinity }): Record<string, unknown> {
  const lower = bound.lower ?? 0;
  const upper = bound.upper ?? Infinity;
  const upperUnbounded = upper === Infinity;
  return {
    is_ordered: false,
    is_unique: false,
    interval: {
      lower_included: true,
      ...(upperUnbounded ? {} : { upper_included: true }),
      lower_unbounded: false,
      upper_unbounded: upperUnbounded,
      lower,
      ...(upperUnbounded ? {} : { upper }),
    },
  };
}

/** ATC, openehr, ICD-10 etc. */
export function codePhrase(terminology: string, codeList: string | string[]): Record<string, unknown> {
  return {
    '@xsi:type': 'C_CODE_PHRASE',
    rm_type_name: 'CODE_PHRASE',
    occurrences: occurrences(),
    node_id: {},
    terminology_id: { value: terminology },
    code_list: Array.isArray(codeList) ? codeList : [codeList],
  };
}

/** A single ELEMENT slot under ITEM_TREE/items. `valueChild` decides the value's RM-type. */
export interface ElementSlot {
  nodeId: string;
  valueChild: Record<string, unknown>;
  /** If true → element required (lower=1). Default 0 (optional). */
  required?: boolean;
}

export function elementSlot(slot: ElementSlot): Record<string, unknown> {
  return {
    '@xsi:type': 'C_COMPLEX_OBJECT',
    rm_type_name: 'ELEMENT',
    occurrences: occurrences({ lower: slot.required ? 1 : 0, upper: 1 }),
    node_id: slot.nodeId,
    attributes: {
      '@xsi:type': 'C_SINGLE_ATTRIBUTE',
      rm_attribute_name: 'value',
      existence: existence({ lower: slot.required ? 1 : 0, upper: 1 }),
      children: slot.valueChild,
    },
  };
}

// --- DV_* value-child builders ---

export function dvText(): Record<string, unknown> {
  return {
    '@xsi:type': 'C_COMPLEX_OBJECT',
    rm_type_name: 'DV_TEXT',
    occurrences: occurrences(),
    node_id: {},
  };
}

export function dvCodedText(terminology: string): Record<string, unknown> {
  return {
    '@xsi:type': 'C_COMPLEX_OBJECT',
    rm_type_name: 'DV_CODED_TEXT',
    occurrences: occurrences(),
    node_id: {},
    attributes: {
      '@xsi:type': 'C_SINGLE_ATTRIBUTE',
      rm_attribute_name: 'defining_code',
      existence: existence(),
      children: {
        '@xsi:type': 'C_CODE_PHRASE',
        rm_type_name: 'CODE_PHRASE',
        occurrences: occurrences(),
        node_id: {},
        terminology_id: { value: terminology },
      },
    },
  };
}

export function dvDateTime(): Record<string, unknown> {
  return {
    '@xsi:type': 'C_COMPLEX_OBJECT',
    rm_type_name: 'DV_DATE_TIME',
    occurrences: occurrences(),
    node_id: {},
  };
}

export interface DvQuantityOpts {
  /** Pin to a specific unit. Omit to accept any unit (variable per analyte). */
  unit?: string;
  /** Optional inclusive lower bound on magnitude (default 0). */
  magnitudeLower?: number;
}

/** DV_QUANTITY with optional unit constraint. Omit `unit` to allow any unit —
 *  required for lab analytes where units differ per test (mmol/mol, µmol/L, ...). */
export function dvQuantity(opts: DvQuantityOpts = {}): Record<string, unknown> {
  const node: Record<string, unknown> = {
    '@xsi:type': 'C_DV_QUANTITY',
    rm_type_name: 'DV_QUANTITY',
    occurrences: occurrences(),
    node_id: {},
  };
  if (opts.unit !== undefined) {
    node.list = {
      magnitude: {
        lower_included: true,
        lower_unbounded: false,
        upper_unbounded: true,
        lower: opts.magnitudeLower ?? 0,
      },
      units: opts.unit,
    };
  }
  return node;
}
