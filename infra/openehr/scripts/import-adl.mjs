#!/usr/bin/env node
/*
 * DP-MS2 — importera en arketyp från en publik CKM-mirror till
 * infra/openehr/archetypes/, med automatiskt PROVENANCE.md-tillägg.
 *
 * Detta är den självbetjäningsväg Block 2:s Northstar syftar på: en region
 * kan lägga till en klinisk modell utan att kontakta Northfactor. Ingen
 * inloggning krävs — samma publika GitHub-mirrors som redan dokumenteras i
 * PROVENANCE.md (raw.githubusercontent.com, ingen auth) — INTE
 * tools.openehr.org/designer (hård gräns, se S3 i styrande sessionsbrief).
 *
 * Användning:
 *   node infra/openehr/scripts/import-adl.mjs <archetype-id> <rm-class-mapp> [mirror]
 *   node infra/openehr/scripts/import-adl.mjs <archetype-id> --from-file <path>
 *
 * Exempel:
 *   node infra/openehr/scripts/import-adl.mjs \
 *     openEHR-EHR-OBSERVATION.body_weight.v2 observation
 *
 *   node infra/openehr/scripts/import-adl.mjs \
 *     openEHR-EHR-OBSERVATION.progress_note.v1 observation modellbiblioteket
 *
 * `--from-file` läser en redan lokalt sparad ADL-fil i stället för att
 * hämta från en mirror — täcker D3:s fallback ("om du inte kan hämta utan
 * login: använd en lokal kopia") och gör den korrupt-ADL-valideringen
 * testbar utan nätverk (se modelling/fixtures/broken-header.adl).
 *
 * Exit codes:
 *   0 = importerad, PROVENANCE.md uppdaterad
 *   1 = fel (nätverk, redan finns, korrupt/felaktigt svar) — inget skrivet
 */

import { createHash } from 'node:crypto';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ARCHETYPES_DIR = join(__dirname, '..', 'archetypes');
const PROVENANCE_PATH = join(ARCHETYPES_DIR, 'PROVENANCE.md');

const MIRRORS = {
  ckm: {
    base: 'https://raw.githubusercontent.com/openEHR/CKM-mirror/master/local/archetypes/entry',
    label: 'openEHR/CKM-mirror (internationell)',
    repo: 'openEHR/CKM-mirror',
  },
  modellbiblioteket: {
    base: 'https://raw.githubusercontent.com/regionstockholm/CKM-mirror-via-modellbibliotek/master/local/archetypes/entry',
    label: 'Region Stockholms mirror av Modellbiblioteket',
    repo: 'regionstockholm/CKM-mirror-via-modellbibliotek',
  },
};

const ARCHETYPE_ID_PATTERN = /^openEHR-EHR-([A-Z_]+)\.([a-z0-9_]+)\.v(\d+)$/;

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  const fromFileIdx = args.indexOf('--from-file');
  const fromFile = fromFileIdx >= 0 ? args[fromFileIdx + 1] : null;
  const archetypeId = args[0];

  if (!archetypeId) {
    fail('Användning: import-adl.mjs <archetype-id> <rm-class-mapp> [ckm|modellbiblioteket]');
    fail('       eller: import-adl.mjs <archetype-id> --from-file <path>');
    return;
  }

  const idMatch = archetypeId.match(ARCHETYPE_ID_PATTERN);
  if (!idMatch) {
    fail(`archetype-id "${archetypeId}" matchar inte formen openEHR-EHR-<KLASS>.<namn>.vN — inget hämtat.`);
    return;
  }

  const fileName = `${archetypeId}.adl`;
  const targetPath = join(ARCHETYPES_DIR, fileName);

  if (existsSync(targetPath)) {
    fail(`${fileName} finns redan i infra/openehr/archetypes/ — importerar inte över en befintlig fil.`);
    return;
  }

  let content;
  let sourceLabel;
  let sourceUrl;
  let mirrorRepo;

  if (fromFile) {
    // D3-fallback: lokal fil i stället för nätverksfetch (och den enda
    // vägen att testa korrupt-ADL-valideringen utan att bero på en
    // extern mirror faktiskt serverar trasigt innehåll).
    if (!existsSync(fromFile)) {
      fail(`Lokal fil "${fromFile}" finns inte.`);
      return;
    }
    content = await readFile(fromFile, 'utf-8');
    sourceLabel = `lokal fil (${fromFile})`;
    sourceUrl = fromFile;
    mirrorRepo = 'lokal fil, ingen mirror';
    console.log(`Läser ${archetypeId} från ${sourceLabel}...`);
  } else {
    const rmClassFolder = args[1];
    const mirrorKey = args[2] ?? 'ckm';
    if (!rmClassFolder) {
      fail('Användning: import-adl.mjs <archetype-id> <rm-class-mapp> [ckm|modellbiblioteket]');
      return;
    }
    const mirror = MIRRORS[mirrorKey];
    if (!mirror) {
      fail(`Okänd mirror "${mirrorKey}". Kända: ${Object.keys(MIRRORS).join(', ')}`);
      return;
    }

    const url = `${mirror.base}/${rmClassFolder}/${fileName}`;
    console.log(`Hämtar ${archetypeId} från ${mirror.label}...`);
    console.log(`  ${url}`);

    let response;
    try {
      response = await fetch(url);
    } catch (err) {
      fail(`Nätverksfel vid hämtning: ${err.message}`);
      return;
    }

    if (!response.ok) {
      fail(`Mirror svarade HTTP ${response.status} — arketypen finns troligen inte på denna sökväg/mirror.`);
      return;
    }

    content = await response.text();
    sourceLabel = mirror.label;
    sourceUrl = url;
    mirrorRepo = mirror.repo;
  }

  // Sanity-kontroll INNAN något skrivs till disk: ett 404-svar från GitHub
  // Pages kan komma som HTTP 200 med en HTML-felsida (vanligt gotcha) —
  // verifiera att innehållet faktiskt är en ADL-header med rätt id, annars
  // är detta ett korrupt/felaktigt svar, inte en riktig arketyp.
  const headerPattern = new RegExp(
    `archetype\\s*\\(adl_version=([0-9.]+)[^)]*\\)\\s*\\r?\\n\\s*${archetypeId.replace(/\./g, '\\.')}\\b`,
  );
  const headerMatch = content.match(headerPattern);
  if (!headerMatch) {
    fail(
      `Svaret innehöll inte en ADL-header som matchar "${archetypeId}" — troligen ett felsvar eller fel arketyp. Inget skrivet.`,
    );
    return;
  }

  const sha256 = createHash('sha256').update(content, 'utf-8').digest('hex');
  const fileSize = Buffer.byteLength(content, 'utf-8');
  const adlVersion = headerMatch[1];
  const today = new Date().toISOString().slice(0, 10);

  await writeFile(targetPath, content, 'utf-8');
  console.log(`✓ Skrev ${fileName} (${fileSize} bytes, ADL ${adlVersion})`);

  try {
    await appendProvenanceEntry({
      fileName,
      archetypeId,
      url: sourceUrl,
      sha256,
      fileSize,
      adlVersion,
      today,
      mirrorRepo,
    });
  } catch (err) {
    // Om PROVENANCE.md inte kunde uppdateras: städa bort den halvfärdiga
    // importen istället för att lämna en arketyp utan spårbarhet.
    await unlink(targetPath).catch(() => {});
    fail(`Kunde inte uppdatera PROVENANCE.md (${err.message}) — ${fileName} togs bort igen.`);
    return;
  }

  console.log(`✓ PROVENANCE.md uppdaterad.`);
  console.log('');
  console.log('Nästa steg:');
  console.log('  pnpm openehr:compile   # kompilera till OPT, se att den blir grön');
  console.log('  git add infra/openehr/archetypes/' + fileName + ' infra/openehr/archetypes/PROVENANCE.md');
  console.log('  git commit -m "feat(openehr): importera ' + archetypeId + ' (DP-MS2)"');
}

async function appendProvenanceEntry({ fileName, archetypeId, url, sha256, fileSize, adlVersion, today, mirrorRepo }) {
  const existing = await readFile(PROVENANCE_PATH, 'utf-8');
  const marker = '\n---\n\n## Reproduktionssteg';
  const markerIndex = existing.indexOf(marker);
  if (markerIndex === -1) {
    throw new Error('hittade inte "## Reproduktionssteg"-markören i PROVENANCE.md — formatet kan ha ändrats');
  }

  const entry = `\n## ${fileName}\n\n` +
    `- **CKM-id:** \`${archetypeId}\`\n` +
    `- **Hämtad från:** ${url}\n` +
    `- **Källrepo:** \`${mirrorRepo}\`\n` +
    `- **Hämtningsdatum:** ${today} (via \`pnpm openehr:import-adl\`, DP-MS2)\n` +
    `- **SHA256:** \`${sha256}\`\n` +
    `- **Filstorlek:** ${fileSize.toLocaleString('sv-SE')} bytes\n` +
    `- **ADL-version:** ${adlVersion}\n` +
    `- **Användning:** Importerad via DP-MS2:s självbetjäningsflöde (nimloth-modelling → import-adl.mjs) — verifierar att en region kan lägga till en modell utan att kontakta Northfactor eller logga in på tools.openehr.org.\n` +
    `- **Licens:** CC-BY-SA (openEHR Foundation / Modellbiblioteket — se filens egen \`other_details["licence"]\` för exakt version).\n`;

  const updated = existing.slice(0, markerIndex) + entry + existing.slice(markerIndex);
  await writeFile(PROVENANCE_PATH, updated, 'utf-8');
}

main().catch((err) => {
  console.error('Oväntat fel:', err);
  process.exit(1);
});
