#!/usr/bin/env tsx
// B4 Etapp 2 — genererar förlustliggaren från src/loss-ledger.ts och
// skriver den till nimloth-docs. Se loss-ledger.ts:s header för vad
// "autogenererad" betyder här.
//
// Körs:
//   tsx src/scripts/generate-loss-ledger.ts [utfil]

import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderLossLedgerMarkdown } from "../loss-ledger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// src/scripts/ -> src -> migration-gateway -> services -> nimloth-core -> Nimloth/ -> nimloth-docs/
const DEFAULT_OUT = path.resolve(__dirname, "../../../../../nimloth-docs/Forlustliggare_Anteckning_2026-08-19.md");
const outPath = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_OUT;
const generatedAtIso = process.env.LOSS_LEDGER_TIMESTAMP ?? new Date().toISOString();

const markdown = renderLossLedgerMarkdown(generatedAtIso);
writeFileSync(outPath, markdown, "utf-8");
console.log(`Förlustliggare skriven till ${outPath} (${markdown.split("\n").length} rader).`);
