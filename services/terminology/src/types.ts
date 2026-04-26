// Datatyper för terminologitjänsten.

/** En översatt kod i målsystemet. */
export interface CodedValue {
  /** Kod-värde (t.ex. "75367002"). */
  code: string;
  /** Display-namn (t.ex. "Blood pressure"). */
  display: string;
  /** Kodsystem-URI (t.ex. "http://snomed.info/sct"). */
  system: string;
}

/** Translate-request: översätt en lokal källkod till ett standardkodsystem. */
export interface TranslateRequest {
  /** Källsystem (t.ex. "MELIOR-VITALS", "MELIOR-NPU"). */
  source: string;
  /** Målsystem-alias (t.ex. "SNOMED", "LOINC", "UCUM"). */
  target: string;
  /** Källkod att översätta. */
  code: string;
}

/** Lookup-request: slå upp display för en känd kod i ett kodsystem. */
export interface LookupRequest {
  /** Kodsystem-alias eller URI ("SNOMED" eller "http://snomed.info/sct"). */
  system: string;
  code: string;
}

/** Lookup-response. */
export interface LookupResult {
  code: string;
  display: string;
  system: string;
  /** Fritext-designations (synonymer + språkvarianter). */
  designations?: Array<{ language?: string; value: string }>;
}

/** Expand-request: expandera en ValueSet till en lista koder. */
export interface ExpandRequest {
  /** Canonical URL för ValueSet, t.ex. "http://hl7.org/fhir/ValueSet/condition-code". */
  url: string;
}

/** FHIR-Parameters-formaterad expand-respons (subset). */
export interface ExpandResult {
  resourceType: 'Parameters';
  parameter: Array<{
    name: string;
    valueString?: string;
    part?: Array<{ name: string; valueCode?: string; valueString?: string }>;
  }>;
}

/** Strukturen i fallback-JSON-filen. */
export interface FallbackData {
  version: string;
  description?: string;
  systems: Record<string, string>;
  translations: Record<string, Record<string, { target: string; code: string; display: string }>>;
  constants: Record<string, unknown>;
}

/** Status-info för observabilitet. */
export interface TerminologyStatus {
  status: 'ok' | 'degraded';
  service: 'terminology';
  loadedAt: string;
  fallback: {
    version: string;
    sources: string[];
    totalCodes: number;
  };
  upstream: {
    snowstorm: { configured: boolean; reachable: boolean | null };
    hapi: { configured: boolean; reachable: boolean | null };
  };
  cache: {
    size: number;
    hits: number;
    misses: number;
  };
  counters: {
    translateRequests: number;
    lookupRequests: number;
    expandRequests: number;
    fallbackHits: number;
    upstreamHits: number;
    notFound: number;
  };
}
