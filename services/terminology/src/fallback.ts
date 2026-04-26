// Fallback-data: laddas från JSON-fil vid startup. Allt i minne (≤100 KB JSON).
//
// Fallback fungerar som primär datakälla under PoC-perioden — Snowstorm och
// HAPI är optional containers som läggs på senare. Designprincipen: terminologi-
// klienten ska aldrig blockera klinisk drift på upstream som inte svarar.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { CodedValue, FallbackData, LookupResult, TranslateRequest } from './types.js';

export class FallbackStore {
  private data: FallbackData | null = null;
  private byCanonicalUri: Map<string, Map<string, CodedValue>> = new Map();

  async load(filePath: string): Promise<void> {
    const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
    const raw = await readFile(resolved, 'utf-8');
    const parsed = JSON.parse(raw) as FallbackData;
    this.data = parsed;

    // Indexera översättningar per (canonical-URI, code) för lookup-anrop som
    // använder URI istället för alias.
    this.byCanonicalUri.clear();
    for (const [, entries] of Object.entries(parsed.translations)) {
      for (const [, value] of Object.entries(entries)) {
        const uri = parsed.systems[value.target];
        if (!uri) continue;
        let bucket = this.byCanonicalUri.get(uri);
        if (!bucket) {
          bucket = new Map();
          this.byCanonicalUri.set(uri, bucket);
        }
        bucket.set(value.code, { code: value.code, display: value.display, system: uri });
      }
    }
  }

  isLoaded(): boolean {
    return this.data !== null;
  }

  getRaw(): FallbackData {
    if (!this.data) throw new Error('Fallback not loaded');
    return this.data;
  }

  /** Översätt källkod → mål via fallback-tabellerna. Returnerar null om okänd. */
  translate(req: TranslateRequest): CodedValue | null {
    if (!this.data) return null;
    const sourceTable = this.data.translations[req.source];
    if (!sourceTable) return null;
    const entry = sourceTable[req.code];
    if (!entry) return null;
    if (entry.target !== req.target) {
      // Källan översätter till annat target. Klienten borde frågat efter
      // det target som finns. Returnera null så consumern kan logga.
      return null;
    }
    const systemUri = this.data.systems[entry.target];
    if (!systemUri) return null;
    return { code: entry.code, display: entry.display, system: systemUri };
  }

  /** Slå upp display för en specifik kod i ett kodsystem. */
  lookup(systemAliasOrUri: string, code: string): LookupResult | null {
    if (!this.data) return null;
    const uri = this.data.systems[systemAliasOrUri] ?? systemAliasOrUri;
    const bucket = this.byCanonicalUri.get(uri);
    if (!bucket) return null;
    const found = bucket.get(code);
    if (!found) return null;
    return { code: found.code, display: found.display, system: uri };
  }

  /** Total antal koder i fallback-data (för status-vyer). */
  totalCodes(): number {
    if (!this.data) return 0;
    let n = 0;
    for (const table of Object.values(this.data.translations)) {
      n += Object.keys(table).length;
    }
    return n;
  }

  /** Lista över källor (translations-keys). */
  listSources(): string[] {
    if (!this.data) return [];
    return Object.keys(this.data.translations);
  }

  /** Hela fallback-snapshot (används av terminology-clienten i transform vid startup). */
  snapshot(): FallbackData {
    if (!this.data) throw new Error('Fallback not loaded');
    return this.data;
  }
}
