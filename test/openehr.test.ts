// openEHR-pipeline smoke-tester (Sprint 2 P3.0).
//
// Kör mot live EHRbase + lokal compiler. Förutsätter:
//   - docker compose up -d ehrbase-db ehrbase
//   - infra/openehr/compiler-image byggd (annars triggar testet bygge)
//
// Anpassad för (C)-leverabeln efter SDK-utforskning visade att archie 3.14.0
// inte har out-of-the-box AOM→XML-OPT-bridge. Compilern är i diagnostic mode;
// fixtures används som "templates" i Sprint 2.
//
// Kör: pnpm --filter @nimloth-core/e2e exec vitest run openehr.test.ts

import { describe, expect, it, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const REPO_ROOT = join(__dirname, '..');
const COMPILER_DIR = join(REPO_ROOT, 'infra/openehr/compiler');
const TEMPLATES_DIR = join(REPO_ROOT, 'infra/openehr/templates');
const FIXTURES_DIR = join(REPO_ROOT, 'infra/openehr/test-fixtures');
const ARCHETYPES_DIR = join(REPO_ROOT, 'infra/openehr/archetypes');

const EHRBASE_URL = process.env.EHRBASE_URL || 'http://localhost:18088';

function sha256(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

// ============================================================
// 1. Compiler-image bygger reproducerbart
// ============================================================
describe('openEHR compiler — image build', () => {
  it('Dockerfile finns och refererar archie-version', () => {
    const df = readFileSync(join(COMPILER_DIR, 'Dockerfile'), 'utf-8');
    expect(df).toContain('eclipse-temurin:21');
    expect(df).toContain('mvn package');
  });

  it('compiler-image bygger', () => {
    execSync('docker build -t nimloth-core/openehr-compiler:0.1.0 .', {
      cwd: COMPILER_DIR,
      stdio: 'pipe',
    });
    const inspect = execSync(
      "docker image inspect nimloth-core/openehr-compiler:0.1.0 --format='{{.Size}}'",
      { encoding: 'utf-8' },
    ).trim();
    expect(Number(inspect)).toBeGreaterThan(50_000_000); // minst 50 MB (JRE + JAR)
    expect(Number(inspect)).toBeLessThan(500_000_000); // max 500 MB
  }, 600_000);
});

// ============================================================
// 2. Compiler kör end-to-end på body_temperature
// ============================================================
describe('openEHR compiler — diagnostic mode end-to-end', () => {
  it('producerar compiler-diagnostic-report.md för body_temperature.v2', () => {
    execSync('pnpm openehr:compile', { cwd: REPO_ROOT, stdio: 'pipe' });
    const reportPath = join(TEMPLATES_DIR, 'compiler-diagnostic-report.md');
    expect(existsSync(reportPath)).toBe(true);
    const report = readFileSync(reportPath, 'utf-8');
    expect(report).toContain('openEHR-EHR-OBSERVATION.body_temperature.v2');
    expect(report).toContain('adl_version: 1.4');
    expect(report).toContain('uid: fbff84f3-2b33-4245-94f1-6dafe6679c54');
    expect(report).toContain('read_status: OK');
  }, 120_000);
});

// ============================================================
// 3. Archetype-källan har korrekt CKM-checksumma
// ============================================================
describe('openEHR archetypes — provenance', () => {
  it('body_temperature.v2.adl matchar dokumenterad SHA256', () => {
    const adlFile = join(ARCHETYPES_DIR, 'openEHR-EHR-OBSERVATION.body_temperature.v2.adl');
    expect(existsSync(adlFile)).toBe(true);
    const buf = readFileSync(adlFile);
    expect(sha256(buf)).toBe('5f3561def29748f73da74c9ab8c715195ad08cefc144954c49c0c68b13472ec3');
  });

  it('PROVENANCE.md beskriver alla committade .adl-filer', () => {
    const provenance = readFileSync(join(ARCHETYPES_DIR, 'PROVENANCE.md'), 'utf-8');
    expect(provenance).toContain('body_temperature.v2');
    expect(provenance).toContain('CC-BY-SA 3.0');
  });
});

// ============================================================
// 4. Test-fixtures är giltigt OPT 1.4 XML
// ============================================================
describe('openEHR test-fixtures — XML structure', () => {
  it('båda fixtures har rätt openEHR namespace', () => {
    for (const file of ['ehrbase-test-minimal-action.opt', 'ehrbase-test-time-series.opt']) {
      const xml = readFileSync(join(FIXTURES_DIR, file), 'utf-8');
      expect(xml).toContain('xmlns="http://schemas.openehr.org/v1"');
      expect(xml).toMatch(/^<\?xml /);
    }
  });

  it('fixtures matchar dokumenterade SHA256', () => {
    expect(sha256(readFileSync(join(FIXTURES_DIR, 'ehrbase-test-minimal-action.opt')))).toBe(
      '98b9282aee8ce1d03bbbd9776246506d0af90c50bc4d1f59677537b75e93228b',
    );
    expect(sha256(readFileSync(join(FIXTURES_DIR, 'ehrbase-test-time-series.opt')))).toBe(
      'aeb2f9ad458f9c531ca34ce158776b9397c6b453dc064339014a2c54cdd6189a',
    );
  });
});

// ============================================================
// 5. Archie-version pinnad i pom.xml
// ============================================================
describe('openEHR compiler — version pinning', () => {
  it('pom.xml använder ingen LATEST eller version-range', () => {
    const pom = readFileSync(join(COMPILER_DIR, 'pom.xml'), 'utf-8');
    expect(pom).not.toMatch(/LATEST/);
    expect(pom).not.toMatch(/<version>RELEASE</);
    expect(pom).not.toMatch(/<version>\[\d+\.\d+,/);
  });

  it('archie-version är spikad i properties', () => {
    const pom = readFileSync(join(COMPILER_DIR, 'pom.xml'), 'utf-8');
    expect(pom).toMatch(/<archie\.version>\d+\.\d+\.\d+<\/archie\.version>/);
  });
});

// ============================================================
// 6. EHRbase live-load (kräver docker compose up -d ehrbase)
// ============================================================
describe('openEHR EHRbase live — fixtures load', () => {
  beforeAll(async () => {
    let attempts = 30;
    while (attempts-- > 0) {
      try {
        const r = await fetch(`${EHRBASE_URL}/ehrbase/`);
        if (r.ok) return;
      } catch {
        /* swallow */
      }
      await new Promise((r) => setTimeout(r, 2_000));
    }
    throw new Error(`EHRbase ej tillgänglig på ${EHRBASE_URL}`);
  }, 70_000);

  it('pnpm openehr:load-templates POSTar fixtures utan fel', () => {
    execSync('pnpm openehr:load-templates', {
      cwd: REPO_ROOT,
      stdio: 'pipe',
      env: { ...process.env, EHRBASE_URL },
    });
  }, 60_000);

  it('GET /template/adl1.4 returnerar minst 2 templates', async () => {
    const r = await fetch(`${EHRBASE_URL}/ehrbase/rest/openehr/v1/definition/template/adl1.4`, {
      headers: { Accept: 'application/json' },
    });
    expect(r.ok).toBe(true);
    const list = (await r.json()) as Array<{ template_id: string }>;
    expect(list.length).toBeGreaterThanOrEqual(2);
    const ids = list.map((t) => t.template_id);
    expect(ids).toContain('minimal_action.en.v1');
    expect(ids).toContain('time_series.en.v1');
  });

  it('round-trip: GET template returnerar XML med korrekt namespace', async () => {
    const r = await fetch(
      `${EHRBASE_URL}/ehrbase/rest/openehr/v1/definition/template/adl1.4/minimal_action.en.v1`,
      { headers: { Accept: 'application/xml' } },
    );
    expect(r.ok).toBe(true);
    const xml = await r.text();
    expect(xml).toContain('xmlns="http://schemas.openehr.org/v1"');
    // EHRbase XML-OPT har nested struktur: <template_id><value>...</value></template_id>
    expect(xml).toMatch(/<template_id>\s*<value>minimal_action\.en\.v1<\/value>\s*<\/template_id>/);
  });
});
