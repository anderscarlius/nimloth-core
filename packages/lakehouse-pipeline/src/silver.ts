import {
  BODY_TEMPERATURE_TEMPLATE_ID,
  BODY_TEMPERATURE_TRIGGER_TYPE,
} from './constants.js';
import { bodyTemperatureMagnitudePath } from './openehr-paths.js';
import type { BronzeCompositionRecord, SilverBodyTemperatureRow } from './types.js';
import type { CachedVitalReading } from './clinical-cache.js';

export function canBuildSilverBodyTemperature(bronze: BronzeCompositionRecord): boolean {
  const p = bronze.provenance;
  return (
    p.template_id === BODY_TEMPERATURE_TEMPLATE_ID &&
    p.trigger_event_type === BODY_TEMPERATURE_TRIGGER_TYPE
  );
}

export function buildSilverBodyTemperatureRow(
  bronze: BronzeCompositionRecord,
  vital: CachedVitalReading,
  ingestedAt: string = new Date().toISOString(),
): SilverBodyTemperatureRow {
  return {
    layer: 'silver',
    data_class: bronze.data_class,
    ingested_at: ingestedAt,
    provenance: bronze.provenance,
    patient_id: bronze.raw.patient_id,
    composition_uid: bronze.raw.payload.composition_uid,
    openehr_path: bodyTemperatureMagnitudePath(),
    magnitude: vital.magnitude,
    units: vital.units,
  };
}

export function serializeSilverLine(row: SilverBodyTemperatureRow): string {
  return `${JSON.stringify(row)}\n`;
}
