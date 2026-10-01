import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface HsaPerson {
  hsaId: string;
  name: string;
  role: string;
  careUnitHsaId?: string;
}

export interface HsaUnit {
  hsaId: string;
  name: string;
}

export interface HsaCatalog {
  persons: HsaPerson[];
  units: HsaUnit[];
}

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

export async function loadCatalog(catalogPath?: string): Promise<HsaCatalog> {
  const resolved =
    catalogPath ??
    path.resolve(moduleDir, '../data/hsa-catalog.json');
  const raw = await readFile(resolved, 'utf8');
  return JSON.parse(raw) as HsaCatalog;
}

export function indexCatalog(catalog: HsaCatalog): {
  personsById: Map<string, HsaPerson>;
  unitsById: Map<string, HsaUnit>;
} {
  return {
    personsById: new Map(catalog.persons.map((p) => [p.hsaId, p])),
    unitsById: new Map(catalog.units.map((u) => [u.hsaId, u])),
  };
}
