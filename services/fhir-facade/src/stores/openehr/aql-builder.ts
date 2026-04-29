// AqlBuilder — laddar AQL-templates från disk vid construction och returnerar
// dem per metod. Templates är statiska i Sprint 2 (Patient/Observation/etc);
// dynamisk filtering (datum-range, kategori) görs klient-sidan i AqlToFhir
// eftersom EHRbase 2.30.1:s AQL-parser är begränsad i WHERE-syntax.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TEMPLATES_DIR = join(dirname(fileURLToPath(import.meta.url)), 'templates');

const TEMPLATE_FILES = [
  'patient',
  'observation',
  'medication-statement',
  'procedure',
  'condition',
] as const;
type TemplateName = (typeof TEMPLATE_FILES)[number];

export class AqlBuilder {
  private readonly templates = new Map<TemplateName, string>();

  constructor() {
    for (const name of TEMPLATE_FILES) {
      const aql = readFileSync(join(TEMPLATES_DIR, `${name}.aql`), 'utf-8');
      this.templates.set(name, aql);
    }
  }

  patient(): string {
    return this.get('patient');
  }
  observation(): string {
    return this.get('observation');
  }
  medicationStatement(): string {
    return this.get('medication-statement');
  }
  procedure(): string {
    return this.get('procedure');
  }
  condition(): string {
    return this.get('condition');
  }

  private get(name: TemplateName): string {
    const t = this.templates.get(name);
    if (!t) throw new Error(`AqlBuilder: template ${name} saknas`);
    return t;
  }
}
