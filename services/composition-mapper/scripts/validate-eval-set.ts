// Strukturell validering av eval-set:s input_fhir mot FHIR R4 Zod-schemat.
// Körs som CLI: pnpm exec tsx scripts/validate-eval-set.ts
// Exit 0 = alla 50 pass, exit 1 = minst en failure.

import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateMedicationStatement, formatValidationErrors } from '../src/validation/fhir.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const evalDir = join(__dirname, '..', 'eval-set');

const files = readdirSync(evalDir)
  .filter((f) => /^med-\d{3}\.json$/.test(f))
  .sort();

let failures = 0;

for (const file of files) {
  const raw = readFileSync(join(evalDir, file), 'utf-8');
  let pair: { input_fhir: unknown };
  try {
    pair = JSON.parse(raw) as { input_fhir: unknown };
  } catch (err) {
    console.error(`${file}: JSON parse error — ${String(err)}`);
    failures++;
    continue;
  }
  const result = validateMedicationStatement(pair.input_fhir);
  if (!result.ok) {
    const errs = formatValidationErrors(result.errors);
    console.error(`${file}: ${errs.length} validation error(s)`);
    for (const e of errs) console.error(`  - ${e.path}: ${e.message}`);
    failures++;
  }
}

console.log(`${files.length} files validated, ${failures} failures`);
process.exit(failures > 0 ? 1 : 0);
