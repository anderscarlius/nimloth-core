import type { TemplateDefinition, TemplateDescriptor } from "./types.js";

// S4-validator — INVARIANT 2 från Fas 1:
//   FLAT-prefix `event_series/` delas mellan time_series.en.v1 och
//   laboratory_test_result.v1. Mallar som filtrerar på FLAT-prefix istället för
//   OBSERVATION/EVALUATION-arketyp blandar lab-data med vitala parametrar.
//   Skiljelinjen är att äkta mallar CONTAINS-filtrerar på arketyp-id.
//
// Vi rejekterar mallar vars AQL refererar `c/composer/name LIKE` (fixture-
// proxy från SDG-10), eller som mappar mot FLAT-prefix utan att namnge
// arketypen i CONTAINS.
const COMPOSER_NAME_LIKE = /c\s*\/\s*composer\s*\/\s*name\s+LIKE/i;
const HAS_ARCHETYPE_CONTAINS = /CONTAINS\s+(OBSERVATION|EVALUATION|ACTION|INSTRUCTION)\s+\w+\s*\[openEHR-EHR-/i;
const HAS_TEMPLATE_FILTER = /c\s*\/\s*archetype_details\s*\/\s*template_id/i;

export class RegistryValidationError extends Error {
  constructor(message: string, public readonly templateId: string, public readonly reason: string) {
    super(message);
  }
}

/** Validate that a template's AQL is honest by INVARIANT 2's criteria.
 *  Throws RegistryValidationError on failure — caller decides whether to
 *  swallow (warn) or fail-loud (registry load). */
export function validateTemplate(t: TemplateDefinition): void {
  if (t.metadata.tier !== "honest") {
    throw new RegistryValidationError(
      `Template ${t.id} has tier='${t.metadata.tier}' but registry accepts only 'honest'`,
      t.id,
      "tier_not_honest",
    );
  }
  if (COMPOSER_NAME_LIKE.test(t.aql)) {
    throw new RegistryValidationError(
      `Template ${t.id} filters on composer/name LIKE — fixture-proxy, not honest`,
      t.id,
      "composer_name_like",
    );
  }
  if (!HAS_ARCHETYPE_CONTAINS.test(t.aql) && !HAS_TEMPLATE_FILTER.test(t.aql)) {
    throw new RegistryValidationError(
      `Template ${t.id} does not CONTAINS an archetype-typed entry nor filter on template_id — INVARIANT 2 risk`,
      t.id,
      "no_archetype_discrimination",
    );
  }
}

export class TemplateRegistry {
  private readonly byId = new Map<string, TemplateDefinition>();

  constructor(templates: TemplateDefinition[]) {
    for (const t of templates) {
      validateTemplate(t);
      this.byId.set(t.id, t);
    }
  }

  list(): TemplateDescriptor[] {
    return [...this.byId.values()].map(stripExecutionDetails);
  }

  get(id: string): TemplateDefinition | undefined {
    return this.byId.get(id);
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  size(): number {
    return this.byId.size;
  }
}

function stripExecutionDetails(t: TemplateDefinition): TemplateDescriptor {
  const { aql: _aql, postProcess: _pp, ...rest } = t;
  return rest;
}
