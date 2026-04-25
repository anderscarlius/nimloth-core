// Lokala typer för transform-tjänsten.

import type { Logger } from 'pino';
import type { PatientCache } from './patient-cache.js';
import type { DqdMetrics } from './quality.js';

/** Re-export av CdcRawEvent från ingest-tjänsten (matchar format). */
export interface CdcRawEvent {
  source_system: 'melior' | 'asynja';
  source_instance: string;
  source_table: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE' | 'SNAPSHOT';
  timestamp: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  metadata: {
    transaction_id?: string;
    lsn?: string;
  };
}

export interface MapperContext {
  instanceId: string;
  patients: PatientCache;
  metrics: DqdMetrics;
  logger: Logger;
}

/** Resultat från en mappning. Lista: kan finnas flera events per CDC-row (t.ex. BT). */
export interface MapperResult {
  topic: string;
  event: Record<string, unknown>;
}

export type Mapper = (raw: CdcRawEvent, ctx: MapperContext) => MapperResult[] | MapperResult | null;

// Hjälpare: Debezium time.precision.mode=connect → epoch-ms
export function tsToIso(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return new Date(value).toISOString();
  return undefined;
}

// Debezium DATE → ms epoch (dagar * 86400000). Med time.precision.mode=connect
// kan DATE dock komma som ms redan. Hantera båda.
export function dateToIso(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') {
    // Om < 100_000 tolka som dagar (epoch-days), annars ms
    const ms = Math.abs(value) < 100_000 ? value * 86_400_000 : value;
    return new Date(ms).toISOString().slice(0, 10);
  }
  return undefined;
}

export function toStringOrUndef(value: unknown): string | undefined {
  if (value == null) return undefined;
  return String(value);
}

export function toNumberOrNull(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return value;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}
