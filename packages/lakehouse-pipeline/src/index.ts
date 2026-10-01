export {
  LAKEHOUSE_BRONZE_STORE,
  LAKEHOUSE_DATA_CLASS,
  BODY_TEMPERATURE_TEMPLATE_ID,
  BODY_TEMPERATURE_TRIGGER_TYPE,
} from './constants.js';
export { bodyTemperatureMagnitudePath, BODY_TEMPERATURE_ARCHETYPE, P3_VITALS_NODE_IDS } from './openehr-paths.js';
export type { BronzeCompositionRecord, SilverBodyTemperatureRow, LakehouseProvenance } from './types.js';
export { buildBronzeCompositionRecord, serializeBronzeLine } from './bronze.js';
export {
  buildSilverBodyTemperatureRow,
  canBuildSilverBodyTemperature,
  serializeSilverLine,
} from './silver.js';
export { ClinicalVitalsCache, type CachedVitalReading } from './clinical-cache.js';
