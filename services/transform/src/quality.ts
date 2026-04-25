// Enkel valideringslogik — returnerar quality_flags.
// DQD: räkna processed events per topic och varningar per typ.

export type QualityFlag =
  | 'MISSING_VALUE'
  | 'MISSING_DIASTOLIC'
  | 'MISSING_UNIT'
  | 'OUT_OF_RANGE'
  | 'MISSING_REFERENCE'
  | 'UNKNOWN_CODE'
  | 'MISSING_ENCOUNTER'
  | 'MISSING_TIMESTAMP';

const RANGES: Record<string, { min: number; max: number }> = {
  BLOOD_PRESSURE: { min: 40, max: 300 },
  HEART_RATE: { min: 20, max: 250 },
  TEMPERATURE: { min: 30, max: 45 },
  SPO2: { min: 50, max: 100 },
  RESPIRATORY_RATE: { min: 5, max: 60 },
  WEIGHT: { min: 1, max: 400 },
  HEIGHT: { min: 30, max: 250 },
};

export function rangeCheck(type: string, value: number | null | undefined): QualityFlag | null {
  if (value == null) return 'MISSING_VALUE';
  const range = RANGES[type];
  if (!range) return null;
  if (value < range.min || value > range.max) return 'OUT_OF_RANGE';
  return null;
}

// ============================================================
// DQD-metrics (enkel counter)
// ============================================================
export class DqdMetrics {
  processedByTopic = new Map<string, number>();
  flagsByType = new Map<string, number>();
  totalProcessed = 0;
  totalErrors = 0;
  latencySumMs = 0;
  latencyCount = 0;

  recordProcessed(topic: string): void {
    this.totalProcessed++;
    this.processedByTopic.set(topic, (this.processedByTopic.get(topic) ?? 0) + 1);
  }

  recordError(): void {
    this.totalErrors++;
  }

  recordFlag(flag: string): void {
    this.flagsByType.set(flag, (this.flagsByType.get(flag) ?? 0) + 1);
  }

  recordLatency(sourceTsMs: number): void {
    const lag = Date.now() - sourceTsMs;
    if (lag >= 0 && lag < 86_400_000) {
      this.latencySumMs += lag;
      this.latencyCount++;
    }
  }

  snapshot(): {
    total_processed: number;
    total_errors: number;
    by_topic: Record<string, number>;
    flags: Record<string, number>;
    avg_latency_ms: number;
  } {
    return {
      total_processed: this.totalProcessed,
      total_errors: this.totalErrors,
      by_topic: Object.fromEntries(this.processedByTopic),
      flags: Object.fromEntries(this.flagsByType),
      avg_latency_ms: this.latencyCount > 0 ? Math.round(this.latencySumMs / this.latencyCount) : 0,
    };
  }
}
