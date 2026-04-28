// GapTracker — primär källa till "Input till P3.0b"-sektionen i P3.1-rapporten.
//
// Loggar generöst: varje payload-fält som inte kunde mappas, varje event-typ
// utan template, varje fixture-feature som saknades. P3.0b-prompten kommer
// dra direkt från denna data för att avgöra vilka constraint-typer bridge:n
// måste täcka.
//
// I-memory only. För Sprint 2 räcker det — composern är inte high-volume.
// Om vi behöver persisterad gap-historik flyttas till Postgres-tabell senare.

export type GapKind =
  | 'no_template_mapping'   // event-typ saknar mapping i event-mapper
  | 'unsupported_payload'   // payload har fält som mapping inte kan hantera
  | 'fixture_limitation'    // fixture-template stödjer inte event-shapen
  | 'composition_rejected'; // EHRbase rejected composition (t.ex. 422)

export interface GapEntry {
  kind: GapKind;
  eventType: string;
  reason: string;
  occurrences: number;
  firstSeen: string;
  lastSeen: string;
  /** Konstateterade constraint-typer eller payload-fält som var problematiska. */
  observations: string[];
}

export class GapTracker {
  private readonly gaps = new Map<string, GapEntry>();
  /** Loggar varje constraint-typ vi *faktiskt* ser i kommande compositions.
   *  Används av P3.1-rapporten för att besvara fråga 1 i sektion 8.3. */
  private readonly constraintCounts = new Map<string, number>();

  log(kind: GapKind, eventType: string, reason: string, observations: string[] = []): void {
    const key = `${kind}|${eventType}|${reason}`;
    const now = new Date().toISOString();
    const existing = this.gaps.get(key);
    if (existing) {
      existing.occurrences += 1;
      existing.lastSeen = now;
      for (const o of observations) {
        if (!existing.observations.includes(o)) existing.observations.push(o);
      }
    } else {
      this.gaps.set(key, {
        kind,
        eventType,
        reason,
        occurrences: 1,
        firstSeen: now,
        lastSeen: now,
        observations: [...observations],
      });
    }
  }

  /** Räknar förekomst av en constraint-typ (t.ex. DV_QUANTITY, CODE_PHRASE). */
  countConstraint(rmTypeName: string): void {
    this.constraintCounts.set(rmTypeName, (this.constraintCounts.get(rmTypeName) ?? 0) + 1);
  }

  getGaps(): GapEntry[] {
    return [...this.gaps.values()].sort((a, b) => b.occurrences - a.occurrences);
  }

  getConstraints(): Array<{ rm_type_name: string; count: number }> {
    return [...this.constraintCounts.entries()]
      .map(([rm_type_name, count]) => ({ rm_type_name, count }))
      .sort((a, b) => b.count - a.count);
  }

  totalGaps(): number {
    let n = 0;
    for (const g of this.gaps.values()) n += g.occurrences;
    return n;
  }
}
