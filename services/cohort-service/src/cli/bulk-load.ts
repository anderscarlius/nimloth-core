// CLI: ladda bulk-bredd till omop.* med _source='preloaded'.
//
// Användning:
//   pnpm --filter @nimloth-core/cohort-service bulk-load
//   COHORT_BULK_SIZE=5000 pnpm --filter @nimloth-core/cohort-service bulk-load
//   COHORT_BULK_SIZE=20000 COHORT_BULK_SEED=demo-2026 pnpm --filter @nimloth-core/cohort-service bulk-load --reset
//
// --reset rensar omop-rader med _source='preloaded' innan reload (för rena demos).
// Utan --reset är körningen idempotent via ON CONFLICT DO NOTHING.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pino from 'pino';
import { loadConfig } from '../config.js';
import { createPool, migrate } from '../db.js';
import { generateBulk } from '../synthetic.js';
import { loadBulk } from '../bulk-loader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main(): Promise<void> {
  const reset = process.argv.includes('--reset');
  const logger = pino(
    {
      level: process.env.LOG_LEVEL ?? 'info',
      base: { service: 'cohort-bulk-load' },
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    pino.destination(2),
  );

  const cfg = loadConfig();
  const pool = createPool(cfg.db);

  try {
    // Migrera cohort-schemat (omop-schemat antas redan migrerat av omop-projector).
    const migrationsDir = path.resolve(__dirname, '..', '..', 'migrations');
    await migrate(pool, migrationsDir, logger);

    if (reset) {
      logger.warn('--reset: tar bort preloaded-rader');
      await pool.query(`DELETE FROM omop.drug_exposure WHERE _source = 'preloaded'`);
      await pool.query(`DELETE FROM omop.measurement WHERE _source = 'preloaded'`);
      await pool.query(`DELETE FROM omop.person WHERE _source = 'preloaded'`);
    }

    logger.info(
      {
        size: cfg.bulk.size,
        offset: cfg.bulk.personIdOffset,
        seed: cfg.bulk.seed,
        from: cfg.bulk.dateFrom,
        to: cfg.bulk.dateTo,
      },
      'genererar bulk-data',
    );

    const tGen = Date.now();
    const data = generateBulk({
      size: cfg.bulk.size,
      personIdOffset: cfg.bulk.personIdOffset,
      masterSeed: cfg.bulk.seed,
      dateFrom: cfg.bulk.dateFrom,
      dateTo: cfg.bulk.dateTo,
    });
    logger.info(
      {
        persons: data.persons.length,
        drugs: data.drugExposures.length,
        meas: data.measurements.length,
        elapsed_ms: Date.now() - tGen,
      },
      'syntetisering klar',
    );

    const report = await loadBulk(pool, data, logger);

    // Sätt person-sequencen så framtida BIGSERIAL inte krockar med preloaded-rymden.
    // Om vi har preloaded id >= 1_000_000 — kasta inte den fram, BIGSERIAL räknar
    // ändå från sitt nuvarande värde, men för säkerhetsmarginal: sätt minst till
    // max(current_value, 1) — vi gör INGENTING om live-rymden är liten (Del 1: 1).
    // Detta är defensiv kodning för framtida live-projektering.
    const seqRes = await pool.query<{ last_value: string }>(`SELECT last_value FROM omop.person_person_id_seq`);
    logger.info({ live_seq_last: seqRes.rows[0]?.last_value }, 'live person_id sequence-status');

    // Source-fördelning som proof
    const summary = await pool.query<{ tbl: string; _source: string; n: string }>(
      `SELECT * FROM omop.v_source_summary`,
    );

    // Rapport
    const out = {
      seed: cfg.bulk.seed,
      size: cfg.bulk.size,
      persons_offset: cfg.bulk.personIdOffset,
      generated: {
        persons: data.persons.length,
        drug_exposures: data.drugExposures.length,
        measurements: data.measurements.length,
      },
      inserted: report,
      source_summary: summary.rows.map((r) => ({ table: r.tbl, source: r._source, n: Number(r.n) })),
    };
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');

    const lines = [
      '',
      '═══════════════════════════════════════════════════',
      `  Bulk-load — seed=${cfg.bulk.seed}, size=${cfg.bulk.size}`,
      '═══════════════════════════════════════════════════',
      `  Genererat:`,
      `    persons:          ${data.persons.length.toString().padStart(7)}`,
      `    drug_exposures:   ${data.drugExposures.length.toString().padStart(7)}`,
      `    measurements:     ${data.measurements.length.toString().padStart(7)}`,
      `  Insertat (efter ON CONFLICT DO NOTHING):`,
      `    persons:          ${String(report.persons_inserted).padStart(7)}`,
      `    drug_exposures:   ${String(report.drug_exposure_inserted).padStart(7)}`,
      `    measurements:     ${String(report.measurement_inserted).padStart(7)}`,
      `  Total tid:          ${(report.elapsed_ms / 1000).toFixed(1).padStart(6)} s`,
      '',
      '  Source-fördelning i OMOP:',
    ];
    for (const r of summary.rows) {
      lines.push(`    ${r.tbl.padEnd(20)} ${r._source.padEnd(16)} ${String(r.n).padStart(7)}`);
    }
    lines.push('═══════════════════════════════════════════════════', '');
    process.stderr.write(lines.join('\n'));
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  process.stderr.write(`FATAL: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(1);
});
