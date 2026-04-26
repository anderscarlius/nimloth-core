// Terminology-client för transform-tjänsten.
//
// Mappers behöver SYNKRONA uppslag (de transformerar events i stor volym
// och får inte blockera per CDC-event). Lösning: hela terminologi-paketet
// laddas i minne vid startup — antingen från remote terminology-service
// (`GET /snapshot`) eller från det lokala fallback-modulen.
//
// API:et är 1:1 med terminology.ts så mappers behöver bara ändra importen.
//
// Warm-strategi:
//   1. Vid startup försöker `warmFromService(url)` hämta /snapshot.
//   2. Lyckas: ersätter standardtabellerna med remote-versionen.
//   3. Misslyckas (service nere, timeout, parse-fel): fortsätter med
//      lokala fallback-konstanter — ingen funktionell skillnad mot innan.
//   4. När terminology-service är upe igen kan re-warm köras manuellt
//      eller via periodisk timer (utanför Sprint 1-scope).

import {
  ALLERGEN_SNOMED as FALLBACK_ALLERGEN,
  DIAGNOSIS_TYPE_SNOMED as FALLBACK_DIAG,
  KVA_TO_SNOMED as FALLBACK_KVA,
  NPU_TO_LOINC as FALLBACK_NPU,
  SYS,
  UCUM_UNITS as FALLBACK_UCUM,
  VITALS_BP_COMPONENTS as FALLBACK_VITALS_BP,
  VITALS_SNOMED as FALLBACK_VITALS,
} from './terminology.js';

export { SYS };

// Mutable in-memory tabeller — startas som kopior av fallback och kan
// uppdateras av warmFromService(). Mappers läser alltid från dessa.
let vitalsSnomed: Record<string, { code: string; display: string }> = { ...FALLBACK_VITALS };
let vitalsBp = { ...FALLBACK_VITALS_BP };
let ucumUnits: Record<string, string> = { ...FALLBACK_UCUM };
let npuToLoincMap: Record<string, { code: string; display: string }> = { ...FALLBACK_NPU };
let kvaToSnomedMap: Record<string, { code: string; display: string }> = { ...FALLBACK_KVA };
let allergenSnomedMap: Record<string, { code: string; display: string }> = { ...FALLBACK_ALLERGEN };
let diagTypeSnomed: Record<string, { code: string; display: string }> = { ...FALLBACK_DIAG };

let warmedFrom: 'fallback' | 'service' = 'fallback';
let warmedAt: string = new Date().toISOString();

export const VITALS_SNOMED = new Proxy({} as Record<string, { code: string; display: string }>, {
  get: (_t, prop: string) => vitalsSnomed[prop],
  has: (_t, prop: string) => prop in vitalsSnomed,
  ownKeys: () => Object.keys(vitalsSnomed),
  getOwnPropertyDescriptor: (_t, prop: string) =>
    prop in vitalsSnomed
      ? { configurable: true, enumerable: true, value: vitalsSnomed[prop], writable: false }
      : undefined,
});

export const VITALS_BP_COMPONENTS = new Proxy(vitalsBp, {
  get: (_t, prop: string) => (vitalsBp as Record<string, unknown>)[prop],
});

export function toUcum(unit: string | null | undefined): string {
  if (!unit) return '';
  return ucumUnits[unit] ?? unit;
}

export function npuToLoinc(npu: string | null | undefined): { code: string; display: string } | null {
  if (!npu) return null;
  return npuToLoincMap[npu] ?? null;
}

export function kvaToSnomed(kva: string | null | undefined): { code: string; display: string } | null {
  if (!kva) return null;
  return kvaToSnomedMap[kva] ?? null;
}

export function allergenToSnomed(text: string | null | undefined): { code: string; display: string } | null {
  if (!text) return null;
  return allergenSnomedMap[text] ?? null;
}

// DIAGNOSIS_TYPE_SNOMED exporteras som proxy så mappers kan göra direkt
// `DIAGNOSIS_TYPE_SNOMED[type]` precis som tidigare.
export const DIAGNOSIS_TYPE_SNOMED = new Proxy(diagTypeSnomed, {
  get: (_t, prop: string) => diagTypeSnomed[prop],
  has: (_t, prop: string) => prop in diagTypeSnomed,
  ownKeys: () => Object.keys(diagTypeSnomed),
  getOwnPropertyDescriptor: (_t, prop: string) =>
    prop in diagTypeSnomed
      ? { configurable: true, enumerable: true, value: diagTypeSnomed[prop], writable: false }
      : undefined,
});

/** Status för observabilitet — vad har transform laddat och varifrån. */
export function clientStatus() {
  return {
    warmedFrom,
    warmedAt,
    counts: {
      vitalsSnomed: Object.keys(vitalsSnomed).length,
      ucum: Object.keys(ucumUnits).length,
      npuToLoinc: Object.keys(npuToLoincMap).length,
      kvaToSnomed: Object.keys(kvaToSnomedMap).length,
      allergenSnomed: Object.keys(allergenSnomedMap).length,
      diagTypeSnomed: Object.keys(diagTypeSnomed).length,
    },
  };
}

interface SnapshotShape {
  version: string;
  systems: Record<string, string>;
  translations: Record<string, Record<string, { target: string; code: string; display: string }>>;
  constants?: Record<string, unknown>;
}

/**
 * Försök varma terminology-tabellerna från terminology-service. Vid fel:
 * behåll fallback-konstanterna och logga via callback (om angiven).
 */
export async function warmFromService(
  baseUrl: string,
  opts: { timeoutMs?: number; logger?: (msg: string, meta?: unknown) => void } = {},
): Promise<boolean> {
  const timeoutMs = opts.timeoutMs ?? 3_000;
  const log = opts.logger ?? (() => undefined);
  const url = `${baseUrl.replace(/\/$/, '')}/snapshot`;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) {
      log('terminology snapshot non-ok status', { status: res.status });
      return false;
    }
    const snapshot = (await res.json()) as SnapshotShape;
    applySnapshot(snapshot);
    warmedFrom = 'service';
    warmedAt = new Date().toISOString();
    log('terminology warmed from service', clientStatus());
    return true;
  } catch (err) {
    log('terminology warm failed — using fallback', { err: String(err) });
    return false;
  }
}

function applySnapshot(s: SnapshotShape): void {
  const newVitals: Record<string, { code: string; display: string }> = {};
  for (const [k, v] of Object.entries(s.translations['MELIOR-VITALS'] ?? {})) {
    newVitals[k] = { code: v.code, display: v.display };
  }
  if (Object.keys(newVitals).length > 0) vitalsSnomed = newVitals;

  const newUcum: Record<string, string> = {};
  for (const [k, v] of Object.entries(s.translations['MELIOR-UCUM'] ?? {})) {
    newUcum[k] = v.code;
  }
  if (Object.keys(newUcum).length > 0) ucumUnits = newUcum;

  const newNpu: Record<string, { code: string; display: string }> = {};
  for (const [k, v] of Object.entries(s.translations['MELIOR-NPU'] ?? {})) {
    newNpu[k] = { code: v.code, display: v.display };
  }
  if (Object.keys(newNpu).length > 0) npuToLoincMap = newNpu;

  const newKva: Record<string, { code: string; display: string }> = {};
  for (const [k, v] of Object.entries(s.translations['MELIOR-KVA'] ?? {})) {
    newKva[k] = { code: v.code, display: v.display };
  }
  if (Object.keys(newKva).length > 0) kvaToSnomedMap = newKva;

  const newAllergen: Record<string, { code: string; display: string }> = {};
  for (const [k, v] of Object.entries(s.translations['MELIOR-ALLERGEN'] ?? {})) {
    newAllergen[k] = { code: v.code, display: v.display };
  }
  if (Object.keys(newAllergen).length > 0) allergenSnomedMap = newAllergen;

  const newDiag: Record<string, { code: string; display: string }> = {};
  for (const [k, v] of Object.entries(s.translations['MELIOR-DIAG-TYPE'] ?? {})) {
    newDiag[k] = { code: v.code, display: v.display };
  }
  if (Object.keys(newDiag).length > 0) diagTypeSnomed = newDiag;

  // Constants (BP-komponenter)
  const c = s.constants?.['VITALS_BP_COMPONENTS'] as
    | { systolic?: { code: string; display: string }; diastolic?: { code: string; display: string } }
    | undefined;
  if (c?.systolic && c?.diastolic) {
    vitalsBp = { systolic: c.systolic, diastolic: c.diastolic };
  }
}
