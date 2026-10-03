import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PdlPurpose } from '@nimloth-core/pdl-policy';

export interface BlockRecord {
  personnummer: string;
  blocked_for: string[];
  reason?: string;
}

export interface ConsentRecord {
  personnummer: string;
  purpose: PdlPurpose;
  granted: boolean;
  note?: string;
}

export interface ConsentRegistry {
  data_class: number;
  synthetic: boolean;
  blocks: BlockRecord[];
  consents: ConsentRecord[];
}

export interface RegistryIndex {
  blocksByPnr: Map<string, BlockRecord>;
  consentsByPnrPurpose: Map<string, ConsentRecord>;
}

function consentKey(pnr: string, purpose: string): string {
  return `${pnr}::${purpose}`;
}

export function indexRegistry(registry: ConsentRegistry): RegistryIndex {
  const blocksByPnr = new Map<string, BlockRecord>();
  for (const b of registry.blocks) {
    blocksByPnr.set(b.personnummer, b);
  }
  const consentsByPnrPurpose = new Map<string, ConsentRecord>();
  for (const c of registry.consents) {
    consentsByPnrPurpose.set(consentKey(c.personnummer, c.purpose), c);
  }
  return { blocksByPnr, consentsByPnrPurpose };
}

export async function loadRegistry(explicitPath?: string): Promise<ConsentRegistry> {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const registryPath =
    explicitPath ??
    process.env.CONSENT_REGISTRY_PATH ??
    path.join(moduleDir, '..', 'data', 'consent-registry.json');
  const raw = await readFile(registryPath, 'utf8');
  return JSON.parse(raw) as ConsentRegistry;
}

export function isBlocked(
  index: RegistryIndex,
  personnummer: string,
  careUnit?: string,
): boolean {
  const rec = index.blocksByPnr.get(personnummer);
  if (!rec) return false;
  const blockedFor = rec.blocked_for ?? [];
  if (blockedFor.length === 0) return true;
  if (!careUnit) return true;
  return blockedFor.includes(careUnit);
}

export function hasResearchConsent(index: RegistryIndex, personnummer: string): boolean {
  const rec = index.consentsByPnrPurpose.get(consentKey(personnummer, 'RESEARCH'));
  return rec?.granted === true;
}
