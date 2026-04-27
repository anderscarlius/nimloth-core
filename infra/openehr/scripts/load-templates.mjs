#!/usr/bin/env node
/*
 * Laddar OPT-templates till EHRbase via REST-API.
 *
 * Default-källor (i ordning):
 *   1. infra/openehr/templates/*.opt        (compiler-output, P3.0b+)
 *   2. infra/openehr/test-fixtures/*.opt    (Sprint 2 fallback per P3.0 pivot C)
 *
 * I Fas 3.0 är (1) tom — compilern är i diagnostic mode. (2) används istället
 * så composer/AQL-broker/paritetsdiff kan utvecklas mot riktiga OPT:er medan
 * P3.0b löser AOM→XML-OPT-bridge.
 *
 * Exit codes:
 *   0 = alla templates laddade
 *   1 = generellt fel (EHRbase nere, IO-fel)
 *   2 = en eller flera templates avvisades
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// __dirname = .../infra/openehr/scripts → templates och fixtures är syskon till scripts
const TEMPLATES_DIR = join(__dirname, '..', 'templates');
const FIXTURES_DIR = join(__dirname, '..', 'test-fixtures');

const EHRBASE_URL = process.env.EHRBASE_URL || 'http://localhost:8088';
const TEMPLATE_ENDPOINT = `${EHRBASE_URL}/ehrbase/rest/openehr/v1/definition/template/adl1.4`;

const USE_FIXTURES = process.env.USE_FIXTURES !== 'false'; // default: true i Fas 3.0
const DRY_RUN = process.env.DRY_RUN === 'true';

async function listOptFiles(dir, prefix = '') {
  try {
    const entries = await readdir(dir);
    return entries
      .filter((e) => e.endsWith('.opt'))
      .filter((e) => !e.startsWith('.'))
      .sort()
      .map((e) => ({ path: join(dir, e), label: prefix + e }));
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

async function loadTemplate(file) {
  const xml = await readFile(file.path, 'utf-8');

  if (DRY_RUN) {
    return { file: file.label, status: 'dry-run', size: xml.length };
  }

  const response = await fetch(TEMPLATE_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/xml',
      'Accept': 'application/xml',
      'Prefer': 'return=minimal',
    },
    body: xml,
  });

  // 409 Conflict = template redan laddad. Idempotent — behandlas som OK.
  if (response.status === 409) {
    return { file: file.label, status: 409, alreadyLoaded: true };
  }

  if (!response.ok) {
    const errorText = await response.text();
    const truncated = errorText.length > 500 ? errorText.slice(0, 500) + '...[truncated]' : errorText;
    throw new Error(`HTTP ${response.status}:\n${truncated}`);
  }

  return { file: file.label, status: response.status, alreadyLoaded: false };
}

async function ensureEhrbaseUp() {
  if (DRY_RUN) return;
  try {
    const r = await fetch(`${EHRBASE_URL}/ehrbase/`);
    if (!r.ok) throw new Error(`EHRbase root returnerade HTTP ${r.status}`);
  } catch (err) {
    console.error(`✗ EHRbase ej tillgänglig på ${EHRBASE_URL}: ${err.message}`);
    console.error('  Kontrollera att docker compose up -d ehrbase är gjort.');
    process.exit(1);
  }
}

async function main() {
  await ensureEhrbaseUp();

  const compilerOutputs = await listOptFiles(TEMPLATES_DIR, 'templates/');
  const fixtures = USE_FIXTURES ? await listOptFiles(FIXTURES_DIR, 'test-fixtures/') : [];

  const all = [...compilerOutputs, ...fixtures];

  if (all.length === 0) {
    console.warn('Inga .opt-filer hittades. Kör pnpm openehr:compile (när P3.0b är klar) eller verifiera test-fixtures/.');
    process.exit(0);
  }

  console.log(`Laddar ${all.length} templates till ${EHRBASE_URL}${DRY_RUN ? ' (DRY RUN)' : ''}...`);
  console.log(`  ${compilerOutputs.length} från templates/ (compiler-output)`);
  console.log(`  ${fixtures.length} från test-fixtures/ (Sprint 2-fallback)`);
  console.log('');

  let failures = 0;
  for (const file of all) {
    try {
      const result = await loadTemplate(file);
      const tag = result.alreadyLoaded ? ' [redan laddad]' : '';
      console.log(`  ✓ ${result.file}  (HTTP ${result.status})${tag}`);
    } catch (err) {
      console.error(`  ✗ ${file.label}`);
      console.error(`    ${err.message}`);
      failures++;
    }
  }

  console.log('');
  if (failures > 0) {
    console.error(`${failures} av ${all.length} templates avvisades.`);
    process.exit(2);
  }
  console.log(`${all.length} templates laddade.`);
}

main().catch((err) => {
  console.error('Oväntat fel:', err);
  process.exit(1);
});
