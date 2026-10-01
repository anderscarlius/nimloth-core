import {
  BODY_TEMPERATURE_TRIGGER_TYPE,
  LAKEHOUSE_DATA_CLASS,
} from './constants.js';

export interface CachedVitalReading {
  event_id: string;
  event_type: string;
  magnitude: number;
  units: string;
  patient_id: string;
  recorded_at: string;
  data_class: typeof LAKEHOUSE_DATA_CLASS;
}

function parseMagnitude(payload: Record<string, unknown>): { magnitude: number; units: string } | null {
  const direct = payload.value;
  if (typeof direct === 'number' && Number.isFinite(direct)) {
    const units = typeof payload.units === 'string' ? payload.units : '°C';
    return { magnitude: direct, units };
  }
  const values = payload.values;
  if (Array.isArray(values) && values.length > 0) {
    const first = values[0];
    if (first && typeof first === 'object') {
      const row = first as Record<string, unknown>;
      if (typeof row.value === 'number' && Number.isFinite(row.value)) {
        const units = typeof row.unit === 'string' ? row.unit : '°C';
        return { magnitude: row.value, units };
      }
    }
  }
  return null;
}

/** Ring-buffer för kliniska vitals — join mot CompositionCommitted via trigger_event_id. */
export class ClinicalVitalsCache {
  private readonly byEventId = new Map<string, CachedVitalReading>();

  constructor(private readonly maxEntries = 500) {}

  rememberFromKafkaMessage(raw: unknown): boolean {
    if (!raw || typeof raw !== 'object') return false;
    const msg = raw as Record<string, unknown>;
    const eventId = msg.event_id;
    const eventType = msg.event_type;
    const patientId = msg.patient_id;
    const timestamp = msg.timestamp;
    const payload = msg.payload;
    if (
      typeof eventId !== 'string' ||
      typeof eventType !== 'string' ||
      typeof patientId !== 'string' ||
      typeof timestamp !== 'string' ||
      !payload ||
      typeof payload !== 'object'
    ) {
      return false;
    }
    if (!eventType.endsWith('body_temperature')) {
      return false;
    }
    const parsed = parseMagnitude(payload as Record<string, unknown>);
    if (!parsed) return false;

    this.byEventId.set(eventId, {
      event_id: eventId,
      event_type: eventType,
      magnitude: parsed.magnitude,
      units: parsed.units,
      patient_id: patientId,
      recorded_at: timestamp,
      data_class: LAKEHOUSE_DATA_CLASS,
    });
    while (this.byEventId.size > this.maxEntries) {
      const oldest = this.byEventId.keys().next().value;
      if (oldest === undefined) break;
      this.byEventId.delete(oldest);
    }
    return true;
  }

  lookupForCompositionTrigger(
    triggerEventId: string,
    triggerEventType: string,
  ): CachedVitalReading | undefined {
    if (triggerEventType !== BODY_TEMPERATURE_TRIGGER_TYPE) {
      return undefined;
    }
    return this.byEventId.get(triggerEventId);
  }
}
