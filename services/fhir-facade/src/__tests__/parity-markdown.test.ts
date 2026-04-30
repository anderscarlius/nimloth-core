// Markdown-renderer-tester (Sprint 2 P3.4, steg 4.9 / AC14).
//
// Ren funktion — string-jämförelse via `expect(out).toContain(...)` snarare
// än golden-file-snapshots. Snapshots-pattern skulle kräva mer infra för
// liten vinst i denna scope.
//
// REGRESSION: 0/0-rader ska klassas som 'no-fixture-data' eller
// 'evaluation-blocked', INTE 'parity'. Bugg fångad i smoke-test 4.5;
// detta test låser fixet.

import { describe, expect, it } from 'vitest';
import { renderSnapshots } from '../parity/markdown.js';
import type { ParitySnapshotRecord } from '../parity/queries.js';
import type { ResourceType } from '../parity/types.js';

function snap(opts: {
  resourceType: ResourceType;
  postgres: number;
  openehr: number;
  patient?: string;
  takenAt?: string;
}): ParitySnapshotRecord {
  return {
    taken_at: opts.takenAt ?? '2026-04-30T12:00:00Z',
    run_id: '00000000-0000-4000-8000-000000000000',
    patient_pnr: opts.patient ?? '19500315-2384',
    resource_type: opts.resourceType,
    postgres_count: opts.postgres,
    openehr_count: opts.openehr,
    mismatch_count: Math.abs(opts.postgres - opts.openehr),
    only_in_postgres: [],
    only_in_openehr: [],
    field_coverage: {},
    trigger: 'manual',
    canonicalisation_version: 1,
  };
}

const FRU_ANDERSSON_DAG_0: ParitySnapshotRecord[] = [
  snap({ resourceType: 'Patient', postgres: 0, openehr: 1 }),
  snap({ resourceType: 'Observation', postgres: 0, openehr: 3 }),
  snap({ resourceType: 'MedicationStatement', postgres: 0, openehr: 0 }),
  snap({ resourceType: 'Procedure', postgres: 0, openehr: 1 }),
  snap({ resourceType: 'Condition', postgres: 0, openehr: 0 }),
  snap({ resourceType: 'AllergyIntolerance', postgres: 0, openehr: 0 }),
];

describe('renderSnapshots — header och struktur', () => {
  it('innehåller alla 3 huvudsektioner: Paritetsrapport / Top-3 / Input till P3.0b', () => {
    const md = renderSnapshots(FRU_ANDERSSON_DAG_0);
    expect(md).toContain('# Paritetsrapport');
    expect(md).toContain('## Top-3 mismatcher');
    expect(md).toContain('## Input till P3.0b');
  });

  it('header-fält Tagen, Patient, Kanoniseringsversion', () => {
    const md = renderSnapshots(FRU_ANDERSSON_DAG_0);
    expect(md).toContain('**Tagen:** 2026-04-30T12:00:00Z');
    expect(md).toContain('**Patient:** 19500315-2384');
    expect(md).toContain('**Kanoniseringsversion:** 1');
  });

  it('huvudtabell har header-rad + 6 dataraden (en per resurstyp)', () => {
    const md = renderSnapshots(FRU_ANDERSSON_DAG_0);
    expect(md).toContain('| Resurstyp | Postgres | OpenEHR | Mismatch | Riktning | Status |');
    // En rad per resurstyp i huvudtabellen — verifiera närvaro
    for (const t of ['Patient', 'Observation', 'MedicationStatement', 'Procedure', 'Condition', 'AllergyIntolerance']) {
      expect(md).toContain(`| ${t} |`);
    }
  });
});

describe('renderSnapshots — riktnings-bestämning', () => {
  it('postgres saknar 3 ⇒ "openehr → postgres (postgres saknar 3)"', () => {
    const md = renderSnapshots([snap({ resourceType: 'Observation', postgres: 0, openehr: 3 })]);
    expect(md).toContain('openehr → postgres (postgres saknar 3)');
  });

  it('openehr saknar 2 ⇒ "postgres → openehr (openehr saknar 2)"', () => {
    const md = renderSnapshots([snap({ resourceType: 'Patient', postgres: 5, openehr: 3 })]);
    expect(md).toContain('postgres → openehr (openehr saknar 2)');
  });

  it('lika counts ⇒ "N/A"', () => {
    const md = renderSnapshots([snap({ resourceType: 'Patient', postgres: 1, openehr: 1 })]);
    expect(md).toContain('| N/A |');
  });
});

describe('renderSnapshots — Top-3-sortering', () => {
  it('sorterar mismatch desc och visar max 3', () => {
    const snapshots: ParitySnapshotRecord[] = [
      snap({ resourceType: 'Patient', postgres: 0, openehr: 1 }), // 1
      snap({ resourceType: 'Observation', postgres: 0, openehr: 5 }), // 5 ← top
      snap({ resourceType: 'Procedure', postgres: 0, openehr: 2 }), // 2
      snap({ resourceType: 'Condition', postgres: 0, openehr: 7 }), // 7 ← second
      snap({ resourceType: 'MedicationStatement', postgres: 0, openehr: 3 }), // 3 ← third
      snap({ resourceType: 'AllergyIntolerance', postgres: 0, openehr: 0 }), // 0 — exkluderat
    ];
    const md = renderSnapshots(snapshots);
    // Top-3 i ordning: Condition (7), Observation (5), MedicationStatement (3)
    const topSection = md.split('## Top-3 mismatcher')[1].split('## Input till P3.0b')[0];
    const conditionIdx = topSection.indexOf('Condition');
    const obsIdx = topSection.indexOf('Observation');
    const medIdx = topSection.indexOf('MedicationStatement');
    expect(conditionIdx).toBeGreaterThan(0);
    expect(conditionIdx).toBeLessThan(obsIdx);
    expect(obsIdx).toBeLessThan(medIdx);
    // 0-mismatch (AllergyIntolerance) exkluderad
    expect(topSection).not.toContain('AllergyIntolerance');
  });

  it('inga mismatcher ⇒ "(inga mismatcher — alla resurstyper i paritet)"', () => {
    const snapshots = [
      snap({ resourceType: 'Patient', postgres: 1, openehr: 1 }),
      snap({ resourceType: 'Observation', postgres: 3, openehr: 3 }),
    ];
    const md = renderSnapshots(snapshots);
    expect(md).toContain('inga mismatcher — alla resurstyper i paritet');
  });
});

describe('renderSnapshots — root-cause-classifier (REGRESSION för smoke-test-bug)', () => {
  it('REGRESSION: 0/0 för MedicationStatement ⇒ "evaluation-blocked", INTE "parity"', () => {
    const md = renderSnapshots([snap({ resourceType: 'MedicationStatement', postgres: 0, openehr: 0 })]);
    expect(md).toContain('evaluation-blocked');
    expect(md).not.toContain('root-cause `parity`');
  });

  it('REGRESSION: 0/0 för Condition ⇒ "evaluation-blocked"', () => {
    const md = renderSnapshots([snap({ resourceType: 'Condition', postgres: 0, openehr: 0 })]);
    expect(md).toContain('evaluation-blocked');
  });

  it('REGRESSION: 0/0 för AllergyIntolerance ⇒ "no-fixture-data"', () => {
    const md = renderSnapshots([snap({ resourceType: 'AllergyIntolerance', postgres: 0, openehr: 0 })]);
    expect(md).toContain('no-fixture-data');
  });

  it('postgres=0, openehr>0 ⇒ "materializer-pending"', () => {
    const md = renderSnapshots([snap({ resourceType: 'Patient', postgres: 0, openehr: 1 })]);
    expect(md).toContain('materializer-pending');
  });

  it('postgres>0, openehr=0 ⇒ "openehr-archetype-missing"', () => {
    const md = renderSnapshots([snap({ resourceType: 'Patient', postgres: 1, openehr: 0 })]);
    expect(md).toContain('openehr-archetype-missing');
  });
});

describe('renderSnapshots — edge cases', () => {
  it('tom snapshots-array ⇒ minimum-rapport med disclaimer', () => {
    const md = renderSnapshots([]);
    expect(md).toContain('# Paritetsrapport');
    expect(md).toContain('inga snapshots');
  });

  it('Input till P3.0b-sektion utelämnas när inga 0/0-rader finns', () => {
    const md = renderSnapshots([
      snap({ resourceType: 'Patient', postgres: 1, openehr: 1 }),
      snap({ resourceType: 'Observation', postgres: 5, openehr: 5 }),
    ]);
    expect(md).not.toContain('## Input till P3.0b');
  });
});
