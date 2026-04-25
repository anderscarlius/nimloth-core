// ConflictResolver — hanterar konflikter när samma kliniska fakta (allergi,
// medication, condition) rapporteras från flera edge-noder eller från både
// Melior och AsynjaVisph för samma patient.
//
// Strategi:
//   1. Timestamp — senaste event vinner (last-write-wins)
//   2. Käll-prioritet vid samma eller osäker tidsstämpel:
//        melior-*   >  asynja  >  flexlab  >  default
//      (Slutenvårdsdokumentation har typiskt högre precision.)
//   3. Datakomplet­tering — vid tie i timestamp och käll-prioritet väljs den
//      post som har fler ifyllda fält.
//
// I PoC:n exponerar vi bara logiken som en pure function + skelett-klass så att
// aggregator + framtida materializers kan anropa den. Ingen persistens av
// konfliktloggen i denna fas — skulle skrivas till core-db i produktion.

export type SourceSystem = string; // "melior-su", "asynja", "flexlab", …

export interface ConflictRecord {
  /** Enklaste globala nyckel för fakta-matchning (t.ex. "allergy:Penicillin"). */
  factKey: string;
  timestamp: string;
  source_system: SourceSystem;
  payload: Record<string, unknown>;
}

export interface ConflictResolution<T extends ConflictRecord = ConflictRecord> {
  winner: T;
  loser: T;
  reason:
    | 'timestamp'
    | 'source_priority'
    | 'completeness'
    | 'identical';
  merged_from: SourceSystem[];
}

const DEFAULT_SOURCE_PRIORITY: Record<string, number> = {
  'melior-su': 100,
  'melior-nu': 100,
  'melior-skas': 100,
  asynja: 80,
  flexlab: 60,
};

function sourcePriority(source: SourceSystem, table = DEFAULT_SOURCE_PRIORITY): number {
  if (source in table) return table[source];
  // "melior-*" täcker alla oregistrerade instanser
  if (source.startsWith('melior-')) return 90;
  return 50;
}

function completeness(payload: Record<string, unknown>): number {
  let score = 0;
  for (const value of Object.values(payload)) {
    if (value == null) continue;
    if (typeof value === 'string' && value.length === 0) continue;
    score++;
  }
  return score;
}

function parseTs(ts: string): number {
  const t = Date.parse(ts);
  return Number.isFinite(t) ? t : 0;
}

export class ConflictResolver {
  constructor(
    private readonly priorityTable: Record<string, number> = DEFAULT_SOURCE_PRIORITY,
  ) {}

  resolve<T extends ConflictRecord>(a: T, b: T): ConflictResolution<T> {
    const ta = parseTs(a.timestamp);
    const tb = parseTs(b.timestamp);
    if (ta > tb) {
      return { winner: a, loser: b, reason: 'timestamp', merged_from: [a.source_system, b.source_system] };
    }
    if (tb > ta) {
      return { winner: b, loser: a, reason: 'timestamp', merged_from: [b.source_system, a.source_system] };
    }

    const pa = sourcePriority(a.source_system, this.priorityTable);
    const pb = sourcePriority(b.source_system, this.priorityTable);
    if (pa > pb) {
      return {
        winner: a,
        loser: b,
        reason: 'source_priority',
        merged_from: [a.source_system, b.source_system],
      };
    }
    if (pb > pa) {
      return {
        winner: b,
        loser: a,
        reason: 'source_priority',
        merged_from: [b.source_system, a.source_system],
      };
    }

    const ca = completeness(a.payload);
    const cb = completeness(b.payload);
    if (ca > cb) {
      return {
        winner: a,
        loser: b,
        reason: 'completeness',
        merged_from: [a.source_system, b.source_system],
      };
    }
    if (cb > ca) {
      return {
        winner: b,
        loser: a,
        reason: 'completeness',
        merged_from: [b.source_system, a.source_system],
      };
    }

    return { winner: a, loser: b, reason: 'identical', merged_from: [a.source_system] };
  }
}
