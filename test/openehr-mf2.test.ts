// DP-MF2 — Modellfabriken CI nivå 2: EHRbase round-trip, AQL-smoke, path-diff.
//
// Kräver live EHRbase (CI: openehr-ci-level2.yml) och compiler-output i templates/.
// Kör: pnpm --filter @nimloth-core/e2e exec vitest run openehr-mf2.test.ts

import { describe, expect, it, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(__dirname, '..');
const TEMPLATES_DIR = join(REPO_ROOT, 'infra/openehr/templates');
const PATH_BASELINES_DIR = join(REPO_ROOT, 'infra/openehr/path-baselines');
const CHECK_PATH_SCRIPT = join(REPO_ROOT, 'infra/openehr/scripts/check-opt-path-baseline.sh');

const EHRBASE_URL = process.env.EHRBASE_URL || 'http://localhost:18088';
const TEMPLATE_API = `${EHRBASE_URL}/ehrbase/rest/openehr/v1/definition/template/adl1.4`;

const COMPILER_TEMPLATES = [
  {
    optFile: 'body_temperature.v2.p3_0b.opt',
    templateId: 'body_temperature.v2.p3_0b',
    archetypeId: 'openEHR-EHR-OBSERVATION.body_temperature.v2',
    baseline: 'body_temperature.v2.p3_0b.paths.txt',
  },
  {
    optFile: 'body_weight.v2.p3_0b.opt',
    templateId: 'body_weight.v2.p3_0b',
    archetypeId: 'openEHR-EHR-OBSERVATION.body_weight.v2',
    baseline: 'body_weight.v2.p3_0b.paths.txt',
  },
] as const;

async function waitForEhrbase(): Promise<void> {
  let attempts = 30;
  while (attempts-- > 0) {
    try {
      const r = await fetch(`${EHRBASE_URL}/ehrbase/`);
      if (r.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }
  throw new Error(`EHRbase ej tillgänglig på ${EHRBASE_URL}`);
}

async function postOpt(xml: string): Promise<{ status: number }> {
  const response = await fetch(TEMPLATE_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/xml',
      Accept: 'application/xml',
      Prefer: 'return=minimal',
    },
    body: xml,
  });
  return { status: response.status };
}

describe('DP-MF2 — compiler OPT path baselines', () => {
  for (const tpl of COMPILER_TEMPLATES) {
    it(`${tpl.templateId}: path inventory matches committed baseline`, () => {
      const optPath = join(TEMPLATES_DIR, tpl.optFile);
      expect(existsSync(optPath)).toBe(true);
      const baselinePath = join(PATH_BASELINES_DIR, tpl.baseline);
      expect(existsSync(baselinePath)).toBe(true);
      execSync(`bash "${CHECK_PATH_SCRIPT}" "${optPath}" "${baselinePath}"`, {
        cwd: REPO_ROOT,
        stdio: 'pipe',
      });
    }, 120_000);
  }

  it('path-diff fails when a baseline path is removed (documented regression guard)', () => {
    const optPath = join(TEMPLATES_DIR, 'body_temperature.v2.p3_0b.opt');
    const baselinePath = join(PATH_BASELINES_DIR, 'body_temperature.v2.p3_0b.paths.txt');
    const tmpBaseline = join(TEMPLATES_DIR, '.mf2-path-diff-fail-test.paths.txt');
    const lines = readFileSync(baselinePath, 'utf-8').trim().split('\n');
    const fakeRemoved = `${lines[0]}\n${lines[1]}\n# synthetic removed path for MF2 fail-case\n/synthetic/removed/path`;
    writeFileSync(tmpBaseline, fakeRemoved);
    let failed = false;
    try {
      execSync(`bash "${CHECK_PATH_SCRIPT}" "${optPath}" "${tmpBaseline}"`, {
        cwd: REPO_ROOT,
        stdio: 'pipe',
      });
    } catch {
      failed = true;
    }
    unlinkSync(tmpBaseline);
    expect(failed).toBe(true);
  }, 120_000);
});

describe('DP-MF2 — EHRbase round-trip (compiler OPT)', () => {
  beforeAll(waitForEhrbase, 70_000);

  for (const tpl of COMPILER_TEMPLATES) {
    it(`POST + GET round-trip for ${tpl.templateId}`, async () => {
      const xml = readFileSync(join(TEMPLATES_DIR, tpl.optFile), 'utf-8');
      expect(xml).toContain('xmlns="http://schemas.openehr.org/v1"');

      const post = await postOpt(xml);
      expect([201, 409]).toContain(post.status);

      const get = await fetch(`${TEMPLATE_API}/${tpl.templateId}`, {
        headers: { Accept: 'application/xml' },
      });
      expect(get.ok).toBe(true);
      const roundTrip = await get.text();
      expect(roundTrip).toContain('xmlns="http://schemas.openehr.org/v1"');
      expect(roundTrip).toMatch(
        new RegExp(
          `<template_id>\\s*<value>${tpl.templateId.replace(/\./g, '\\.')}<\\/value>\\s*<\\/template_id>`,
        ),
      );
      expect(roundTrip).toContain(tpl.archetypeId);
    }, 60_000);
  }
});

describe('DP-MF2 — AQL smoke (synthetic dataclass 0)', () => {
  const TEMPLATE_ID = 'body_temperature.v2.p3_0b';
  const SUBJECT_SCHEME = 'nimloth-mf2-synthetic';

  beforeAll(async () => {
    await waitForEhrbase();
    const xml = readFileSync(join(TEMPLATES_DIR, `${TEMPLATE_ID}.opt`), 'utf-8');
    const post = await postOpt(xml);
    expect([201, 409]).toContain(post.status);
  }, 90_000);

  it('AQL returns ≥1 row after POST composition', async () => {
    const subjectId = `mf2-aql-${Date.now()}`;
    const ehrResp = await fetch(`${EHRBASE_URL}/ehrbase/rest/openehr/v1/ehr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({
        _type: 'EHR_STATUS',
        archetype_node_id: 'openEHR-EHR-EHR_STATUS.generic.v1',
        name: { value: 'EHR Status' },
        subject: {
          external_ref: {
            id: { _type: 'GENERIC_ID', value: subjectId, scheme: SUBJECT_SCHEME },
            namespace: 'test',
            type: 'PERSON',
          },
        },
        is_queryable: true,
        is_modifiable: true,
      }),
    });
    expect(ehrResp.status).toBe(201);
    const ehr = (await ehrResp.json()) as { ehr_id: { value: string } };
    const ehrId = ehr.ehr_id.value;
    const now = new Date().toISOString();

    const openEhrTerm = (code: string) => ({
      terminology_id: { value: 'openehr' },
      code_string: code,
    });
    const composition = {
      _type: 'COMPOSITION',
      name: { value: 'Body temperature' },
      archetype_node_id: 'openEHR-EHR-COMPOSITION.minimal.v1',
      archetype_details: {
        _type: 'ARCHETYPED',
        archetype_id: { value: 'openEHR-EHR-COMPOSITION.minimal.v1' },
        template_id: { value: TEMPLATE_ID },
        rm_version: '1.0.4',
      },
      language: { terminology_id: { value: 'ISO_639-1' }, code_string: 'en' },
      territory: { terminology_id: { value: 'ISO_3166-1' }, code_string: 'SE' },
      category: {
        _type: 'DV_CODED_TEXT',
        value: 'event',
        defining_code: openEhrTerm('433'),
      },
      composer: { _type: 'PARTY_IDENTIFIED', name: 'MF2 CI synthetic' },
      context: {
        _type: 'EVENT_CONTEXT',
        start_time: { value: now },
        setting: {
          _type: 'DV_CODED_TEXT',
          value: 'other care',
          defining_code: openEhrTerm('238'),
        },
      },
      content: [
        {
          _type: 'OBSERVATION',
          name: { value: 'Body temperature' },
          archetype_node_id: 'openEHR-EHR-OBSERVATION.body_temperature.v2',
          archetype_details: {
            _type: 'ARCHETYPED',
            archetype_id: { value: 'openEHR-EHR-OBSERVATION.body_temperature.v2.1.9' },
            rm_version: '1.0.4',
          },
          language: { terminology_id: { value: 'ISO_639-1' }, code_string: 'en' },
          encoding: {
            _type: 'CODE_PHRASE',
            terminology_id: { value: 'IANA_character-sets' },
            code_string: 'UTF-8',
          },
          subject: { _type: 'PARTY_SELF' },
          data: {
            _type: 'HISTORY',
            archetype_node_id: 'at0002',
            name: { value: 'History' },
            origin: { value: now },
            events: [
              {
                _type: 'POINT_EVENT',
                archetype_node_id: 'at0003',
                name: { value: 'Any event' },
                time: { value: now },
                data: {
                  _type: 'ITEM_TREE',
                  archetype_node_id: 'at0001',
                  name: { value: 'Tree' },
                  items: [
                    {
                      _type: 'ELEMENT',
                      archetype_node_id: 'at0004',
                      name: { value: 'Temperature' },
                      value: {
                        _type: 'DV_QUANTITY',
                        magnitude: 37.2,
                        units: 'Cel',
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      ],
    };

    const compResp = await fetch(`${EHRBASE_URL}/ehrbase/rest/openehr/v1/ehr/${ehrId}/composition`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Prefer: 'return=representation',
        'openEHR-TEMPLATE_ID': TEMPLATE_ID,
      },
      body: JSON.stringify(composition),
    });
    if (compResp.status !== 201) {
      const errBody = await compResp.text();
      throw new Error(`Composition POST ${compResp.status}: ${errBody.slice(0, 1200)}`);
    }

    const aql = {
      q: `SELECT o/data[at0002]/events[at0003]/data[at0001]/items[at0004]/value/magnitude AS temp
          FROM EHR e[ehr_id/value='${ehrId}']
          CONTAINS COMPOSITION c
          CONTAINS OBSERVATION o[openEHR-EHR-OBSERVATION.body_temperature.v2]
          WHERE o/data[at0002]/events[at0003]/data[at0001]/items[at0004]/value/magnitude = 37.2`,
    };
    const aqlResp = await fetch(`${EHRBASE_URL}/ehrbase/rest/openehr/v1/query/aql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(aql),
    });
    expect(aqlResp.status).toBe(200);
    const result = (await aqlResp.json()) as { rows: unknown[][] };
    expect(result.rows.length).toBeGreaterThanOrEqual(1);
  }, 60_000);
});
