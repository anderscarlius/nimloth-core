// CLI: pnpm mapper:propose
//
// Tunn wrapper som POST:ar till mapping-assistant-tjänstens /propose-endpoint.
// Designad för att vara enkel — om du vill ha schema-introspektion mot
// källdb är det `--schema-from-stdin` (läser JSON via stdin).
//
// Användning:
//   pnpm mapper:propose --source flexlab.results --target core.clinical.lab.result \
//     --schema '[{"column":"patient_id","type":"integer"}]'
//
//   echo '{...}' | pnpm mapper:propose --source X --target Y --schema-from-stdin
//
//   pnpm mapper:propose --source X --target Y --schema-file ./schema.json
//
// Output: hela suggestion-rad-JSON-objektet på stdout.

import { readFileSync } from 'node:fs';

interface Args {
  source: string;
  target: string;
  schema: Array<{ column: string; type: string; nullable?: boolean }>;
  samples?: Array<Record<string, unknown>>;
  existingMappers?: string[];
  endpoint: string;
}

function parseArgs(argv: string[]): Args {
  const out: Partial<Args> & { endpoint: string } = {
    endpoint: process.env.MAPPING_ASSISTANT_URL ?? 'http://localhost:3009',
  };
  let schemaFromStdin = false;
  let schemaFile: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case '--source':
        out.source = next;
        i++;
        break;
      case '--target':
        out.target = next;
        i++;
        break;
      case '--schema':
        out.schema = JSON.parse(next) as Args['schema'];
        i++;
        break;
      case '--schema-from-stdin':
        schemaFromStdin = true;
        break;
      case '--schema-file':
        schemaFile = next;
        i++;
        break;
      case '--samples':
        out.samples = JSON.parse(next) as Args['samples'];
        i++;
        break;
      case '--samples-file':
        out.samples = JSON.parse(readFileSync(next, 'utf-8')) as Args['samples'];
        i++;
        break;
      case '--endpoint':
        out.endpoint = next;
        i++;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
      default:
        if (arg.startsWith('--')) {
          console.error(`Unknown flag: ${arg}`);
          process.exit(2);
        }
    }
  }

  if (schemaFile) {
    out.schema = JSON.parse(readFileSync(schemaFile, 'utf-8')) as Args['schema'];
  } else if (schemaFromStdin) {
    out.schema = JSON.parse(readFileSync(0, 'utf-8')) as Args['schema'];
  }

  if (!out.source || !out.target || !out.schema) {
    console.error('Missing required: --source, --target, --schema (or --schema-file/--schema-from-stdin)');
    process.exit(2);
  }
  return out as Args;
}

function printHelp(): void {
  // eslint-disable-next-line no-console
  console.log(`pnpm mapper:propose — Föreslå ny TypeScript-mapper

Användning:
  pnpm mapper:propose --source <s> --target <t> --schema '<json>' [--samples '<json>']

Flaggor:
  --source <s>          Källtabell, t.ex. flexlab.results
  --target <t>          Måltopic eller FHIR-resource, t.ex. core.clinical.lab.result
  --schema '<json>'     JSON-array med {column, type}
  --schema-file <path>  Läs schema från fil
  --schema-from-stdin   Läs schema från stdin
  --samples '<json>'    JSON-array med exempel-rader (syntetiska)
  --samples-file <path> Läs samples från fil
  --endpoint <url>      Default http://localhost:3009 (MAPPING_ASSISTANT_URL)
  --help, -h            Visa denna hjälp
`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const url = args.endpoint.replace(/\/$/, '') + '/propose';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source: args.source,
      target: args.target,
      schema: args.schema,
      samples: args.samples,
      existingMappers: args.existingMappers,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '<no body>');
    console.error(`HTTP ${res.status}: ${detail}`);
    process.exit(1);
  }
  const body = (await res.json()) as Record<string, unknown>;
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(body, null, 2));
}

main().catch((err) => {
  console.error('mapper:propose failed:', err);
  process.exit(1);
});
