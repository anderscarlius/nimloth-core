// Markdown-renderer för paritetsrapport (Sprint 2 P3.4, steg 4.6).
//
// Tar en lista ParitySnapshotRecord och bygger en human-readable rapport
// enligt format i nimloth-docs/P3.4_Paritetsdiff_Dashboard.md sektion 4.6.
// Inga third-party deps — vanlig string-byggnad räcker.

import type { ResourceType } from './types.js';
import type { ParitySnapshotRecord } from './queries.js';

/** Root-cause-enum enligt AC13. Sprint 2-värden:
 *  - parity: båda counts lika (no mismatch)
 *  - materializer-pending: postgres=0, openehr>0 (postgres ej materialiserad)
 *  - openehr-archetype-missing: postgres>0, openehr=0 (saknas i openehr)
 *  - evaluation-blocked: båda=0 för MedicationStatement/Condition (väntar P3.0b)
 *  - no-fixture-data: båda=0 för övrigt
 *  - unknown: omatchat fall (bör flaggas för manuell granskning) */
type RootCause =
  | 'parity'
  | 'materializer-pending'
  | 'openehr-archetype-missing'
  | 'evaluation-blocked'
  | 'no-fixture-data'
  | 'unknown';

const EVALUATION_BLOCKED: ReadonlySet<ResourceType> = new Set([
  'MedicationStatement',
  'Condition',
]);

function classifyRootCause(s: ParitySnapshotRecord): RootCause {
  const p = s.postgres_count;
  const o = s.openehr_count;
  // Ordning är viktig: both-zero MÅSTE kontrolleras före p === o-check,
  // annars klassas 0/0 felaktigt som 'parity'.
  if (p === 0 && o === 0) {
    return EVALUATION_BLOCKED.has(s.resource_type as ResourceType)
      ? 'evaluation-blocked'
      : 'no-fixture-data';
  }
  if (p === o) return 'parity';
  if (p === 0 && o > 0) return 'materializer-pending';
  if (o === 0 && p > 0) return 'openehr-archetype-missing';
  return 'unknown';
}

function direction(s: ParitySnapshotRecord): string {
  if (s.postgres_count === s.openehr_count) return 'N/A';
  if (s.postgres_count > s.openehr_count) {
    return `postgres → openehr (openehr saknar ${s.postgres_count - s.openehr_count})`;
  }
  return `openehr → postgres (postgres saknar ${s.openehr_count - s.postgres_count})`;
}

function statusEmoji(s: ParitySnapshotRecord): string {
  if (s.mismatch_count === 0) return '✓';
  return '⚠️';
}

/** Render en lista snapshots som markdown-rapport. Förutsätter att alla
 *  snapshots tillhör samma run_id (eller åtminstone samma patient — om
 *  flera runs blandas blir top-3 över alla men huvudtabellen visar
 *  blandning som kan vara förvirrande). */
export function renderSnapshots(snapshots: ParitySnapshotRecord[]): string {
  if (snapshots.length === 0) {
    return '# Paritetsrapport\n\n_(inga snapshots — ingen run gjord ännu)_\n';
  }

  // Använd taken_at + patient_pnr från första rad som "rapport-headers".
  // För latest/history kommer alla snapshots normalt ha samma run om
  // limit täcker exakt en run; annars är det blandad data.
  const head = snapshots[0];
  const allSamePatient = snapshots.every((s) => s.patient_pnr === head.patient_pnr);
  const allSameRun = snapshots.every((s) => s.run_id === head.run_id);

  const lines: string[] = [];
  lines.push('# Paritetsrapport');
  lines.push('');
  lines.push(`**Tagen:** ${head.taken_at}${allSameRun ? '' : ' (blandad — flera runs)'}`);
  lines.push(`**Patient:** ${allSamePatient ? head.patient_pnr || '(aggregat)' : '(blandat)'}`);
  lines.push(`**Kanoniseringsversion:** ${head.canonicalisation_version}`);
  lines.push('');

  // Huvudtabell — sortera på resource_type för deterministisk ordning.
  const sorted = [...snapshots].sort((a, b) => a.resource_type.localeCompare(b.resource_type));
  lines.push('| Resurstyp | Postgres | OpenEHR | Mismatch | Riktning | Status |');
  lines.push('|-----------|---------:|--------:|---------:|----------|--------|');
  for (const s of sorted) {
    lines.push(
      `| ${s.resource_type} | ${s.postgres_count} | ${s.openehr_count} | ` +
        `${s.mismatch_count} | ${direction(s)} | ${statusEmoji(s)} |`,
    );
  }
  lines.push('');

  // Top-3 mismatch — exklusive parity-rader.
  const mismatchRows = sorted
    .filter((s) => s.mismatch_count > 0)
    .sort((a, b) => b.mismatch_count - a.mismatch_count)
    .slice(0, 3);

  lines.push('## Top-3 mismatcher');
  lines.push('');
  if (mismatchRows.length === 0) {
    lines.push('_(inga mismatcher — alla resurstyper i paritet)_');
  } else {
    lines.push('| # | Resurstyp | Mismatch | Riktning | Root-cause-hypotes |');
    lines.push('|---|-----------|---------:|----------|---------------------|');
    mismatchRows.forEach((s, i) => {
      lines.push(
        `| ${i + 1} | ${s.resource_type} | ${s.mismatch_count} | ` +
          `${direction(s)} | ${classifyRootCause(s)} |`,
      );
    });
  }
  lines.push('');

  // Input till P3.0b: rader där båda stores = 0 (separat sektion).
  const zeroBoth = sorted.filter((s) => s.postgres_count === 0 && s.openehr_count === 0);
  if (zeroBoth.length > 0) {
    lines.push('## Input till P3.0b');
    lines.push('');
    for (const s of zeroBoth) {
      lines.push(`- **${s.resource_type}:** båda stores 0 → root-cause \`${classifyRootCause(s)}\``);
    }
    lines.push('');
  }

  return lines.join('\n');
}
