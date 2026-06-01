// Eval-runner CLI för OMOP-projektorn.
//
// Användning:
//   pnpm --filter @nimloth-core/omop-projector omop:project --patient ingrid-andersson-syn-001
//   pnpm --filter @nimloth-core/omop-projector omop:project --patient ingrid-andersson-syn-001 --reset
//
// --reset wipe:ar OMOP-schemat innan projektering (för rena demos).
// Utan --reset används UPSERT/ON CONFLICT DO NOTHING — idempotent.
//
// Rapport skrivs som JSON till stdout + människovänlig sammanfattning till stderr.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pino from 'pino';
import { loadConfig } from './config.js';
import { createPool, migrate } from './db.js';
import { OmopProjector } from './projector.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface CliArgs {
  patient: string;
  reset: boolean;
  migrate: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { patient: '', reset: false, migrate: true };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--patient' || a === '-p') {
      args.patient = argv[++i] ?? '';
    } else if (a === '--reset') {
      args.reset = true;
    } else if (a === '--no-migrate') {
      args.migrate = false;
    } else if (a === '--help' || a === '-h') {
      printHelp();
      process.exit(0);
    }
  }
  return args;
}

function printHelp(): void {
  process.stderr.write(
    [
      'OMOP-projektor — eval-runner',
      '',
      'Användning:',
      '  omop:project --patient <patient-id> [--reset] [--no-migrate]',
      '',
      'Flaggor:',
      '  --patient, -p   Patient-id (ehr_status.subject.external_ref.id)',
      '  --reset         TRUNCATE omop.* före projektering (rena demos)',
      '  --no-migrate    Hoppa över migrate (förutsätter schema finns)',
      '',
      'Env:',
      '  OMOP_DB_HOST, OMOP_DB_PORT, OMOP_DB_NAME, OMOP_DB_USER, OMOP_DB_PASSWORD',
      '  EHRBASE_BASE_URL, OMOP_TRANSFORM_VERSION',
      '',
    ].join('\n'),
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  if (!args.patient) {
    process.stderr.write('FEL: --patient krävs\n');
    printHelp();
    process.exit(2);
  }

  // Logga till stderr (raw JSON; stdout reserverat för rapport-JSON).
  const logger = pino(
    {
      level: process.env.LOG_LEVEL ?? 'info',
      base: { service: 'omop-projector' },
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    pino.destination(2),
  );
  const cfg = loadConfig();
  const pool = createPool(cfg.db);

  try {
    if (args.migrate) {
      const migrationsDir = path.resolve(__dirname, '..', 'migrations');
      await migrate(pool, migrationsDir, logger);
    }

    if (args.reset) {
      logger.warn('--reset aktiv: TRUNCATE omop.*');
      await pool.query(
        `TRUNCATE TABLE omop.drug_exposure, omop.measurement, omop.condition_occurrence,
           omop.visit_occurrence, omop.observation_period, omop.person RESTART IDENTITY CASCADE`,
      );
    }

    const projector = new OmopProjector({ pool, config: cfg, logger });
    const report = await projector.projectPatient(args.patient);

    // JSON till stdout (för pipe/loggning).
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');

    // Människovänlig sammanfattning till stderr.
    const summary = [
      '',
      '═══════════════════════════════════════════════════',
      `  OMOP-projektering — ${report.patient_source_value}`,
      '═══════════════════════════════════════════════════',
      `  EHR-id:                ${report.ehr_id}`,
      `  Transform-version:     ${report.transform_version}`,
      '',
      '  Projekterade rader:',
      `    drug_exposure:       ${report.drug_exposure_rows}`,
      `    measurement:         ${report.measurement_rows}`,
      '',
      '  Lineage-täckning:',
      `    drug_exposure-uids:  ${report.lineage_coverage.drug_exposure_with_uid}`,
      `    measurement-uids:    ${report.lineage_coverage.measurement_with_uid}`,
      `    totalt distinkta:    ${report.lineage_coverage.total_uids_seen}`,
      '',
      `  Degraderingar:         ${report.degradations.length}`,
    ];
    if (report.unsupported_sources.length) {
      summary.push('', '  Ostödda källor (utanför Del 1):');
      for (const u of report.unsupported_sources) {
        summary.push(`    ${u.archetype.padEnd(35)} ${String(u.count).padStart(3)}  — ${u.reason}`);
      }
    }
    summary.push('═══════════════════════════════════════════════════', '');
    process.stderr.write(summary.join('\n'));
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  process.stderr.write(`FATAL: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(1);
});
