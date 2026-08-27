#!/usr/bin/env tsx
// B4 Etapp 3 — självbärandetestet (Grind 1, punkt d / S4). ENDAST
// filsystemsläsning och hashning nedan. Noll HTTP-anrop till gateway,
// EHRbase eller legacy-sim — om detta skript klarar sig utan någon av
// de tre tjänsterna uppe är "läsbart utan Nimloth" bevisat, inte
// påstått. Bevisar INTEGRITET (filerna är oförvanskade mot manifestet)
// — INTE fullständighet, se assertManifestComplete i export-package.ts
// för den andra, oberoende kontrollen.
//
// Körs (tjänster får gärna vara nere):
//   tsx src/scripts/verify-export-package.ts ./export-output

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

function sha256Hex(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function assertFhirResource(json: unknown, expectedResourceType: string, label: string): void {
  const obj = json as Record<string, unknown>;
  if (obj.resourceType !== expectedResourceType) {
    throw new Error(`${label}: resourceType är "${obj.resourceType}", förväntade "${expectedResourceType}"`);
  }
  if (!obj.id) throw new Error(`${label}: saknar obligatoriskt fält "id"`);
  if (!obj.status) throw new Error(`${label}: saknar obligatoriskt fält "status"`);
}

async function main(): Promise<void> {
  const [outDir] = process.argv.slice(2);
  if (!outDir) {
    console.error("Användning: verify-export-package.ts <out_dir>");
    process.exit(1);
  }

  const manifestRaw = await readFile(path.join(outDir, "manifest.json"), "utf8");
  const manifest = JSON.parse(manifestRaw) as {
    itemCount: number;
    lossLedger: { file: string; sourcePath: string; sha256: string };
    items: Array<{
      voId: string;
      files: { openehrComposition: string; fhirComposition: string; fhirDocumentReference: string };
      sha256: { openehrComposition: string; fhirComposition: string; fhirDocumentReference: string };
    }>;
  };

  let checked = 0;
  const failures: string[] = [];

  for (const item of manifest.items) {
    for (const key of ["openehrComposition", "fhirComposition", "fhirDocumentReference"] as const) {
      const filePath = path.join(outDir, item.files[key]);
      const content = await readFile(filePath, "utf8");
      const actualHash = sha256Hex(content);
      checked++;
      if (actualHash !== item.sha256[key]) {
        failures.push(`${item.voId}/${key}: SHA-256 stämmer inte (manifest=${item.sha256[key]}, faktisk=${actualHash})`);
        continue;
      }
      if (key === "fhirComposition") assertFhirResource(JSON.parse(content), "Composition", `${item.voId}/fhirComposition`);
      if (key === "fhirDocumentReference") assertFhirResource(JSON.parse(content), "DocumentReference", `${item.voId}/fhirDocumentReference`);
    }
  }

  // Förlustliggaren är innehållsförteckningen — kopierad IN i paketet
  // (inte bara refererad, se export-package.ts), så självbärandetestet
  // aldrig behöver lämna outDir. sourcePath finns kvar i manifestet för
  // spårbarhet, men läses inte här.
  const lossLedgerContent = await readFile(path.join(outDir, manifest.lossLedger.file), "utf8");
  const lossLedgerHash = sha256Hex(lossLedgerContent);
  if (lossLedgerHash !== manifest.lossLedger.sha256) {
    failures.push(
      `förlustliggaren: SHA-256 stämmer inte mot manifestet (manifest=${manifest.lossLedger.sha256}, faktisk=${lossLedgerHash}) — liggaren har regenererats sedan paketet byggdes`,
    );
  }
  checked++;

  console.log(`Självbärandetest: ${checked} filer kontrollerade, ${manifest.items.length} poster, 0 HTTP-anrop.`);
  if (failures.length > 0) {
    console.error(`\nFEL (${failures.length}):`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("Alla kontroller gröna — paketet är läsbart och intakt utan Nimloth.");
}

main().catch((err) => {
  console.error("fatalt fel:", err);
  process.exit(1);
});
