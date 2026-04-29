// CoverageTracker — loggar fält som var null/undefined efter AQL-extraktion.
//
// Indikerar template som inte exponerade fältet eller AQL-template som missade
// det. Värdefull diagnostisk data när vi senare bygger P3.0b XML-OPT-bridge —
// fält som ofta saknas i openehr-vägen är de som behöver mappas explicit.
//
// In-memory Map. För produktion behövs tids-rotation eller fast cap; för
// Sprint 2 räcker det. /facade/coverage/reset rensar manuellt.

export interface CoverageEntry {
  resource: string;
  field: string;
  missingCount: number;
  /** Senaste sample (anonymized — bara archetype-id, inte patient-data). */
  lastSample?: string;
}

export class CoverageTracker {
  private readonly gaps = new Map<string, { count: number; lastSample?: string }>();

  /**
   * Logga när ett FHIR-fält var null/undefined efter AQL-extraktion.
   *
   * @param resourceType T.ex. 'Observation'
   * @param fieldPath FHIR-path, t.ex. 'value' eller 'code.coding[0].system'
   * @param sample Diagnostisk sample (archetype-id, template-id) — får INTE innehålla patient-data
   */
  logMissingField(resourceType: string, fieldPath: string, sample?: string): void {
    const key = `${resourceType}:${fieldPath}`;
    const existing = this.gaps.get(key);
    if (existing) {
      existing.count += 1;
      if (sample) existing.lastSample = sample;
    } else {
      this.gaps.set(key, { count: 1, lastSample: sample });
    }
  }

  getCoverageReport(): CoverageEntry[] {
    return Array.from(this.gaps.entries())
      .map(([key, { count, lastSample }]) => {
        const sep = key.indexOf(':');
        return {
          resource: key.slice(0, sep),
          field: key.slice(sep + 1),
          missingCount: count,
          lastSample,
        };
      })
      .sort((a, b) => b.missingCount - a.missingCount);
  }

  totalMissing(): number {
    let n = 0;
    for (const { count } of this.gaps.values()) n += count;
    return n;
  }

  reset(): void {
    this.gaps.clear();
  }
}
