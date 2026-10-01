/** WP-LH1 smoke — syntetisk demo-data only (ingen patient-PHI i git). */
export const LAKEHOUSE_DATA_CLASS = 0 as const;

/** Interim agreed store until MinIO/Iceberg profile lands (P6). */
export const LAKEHOUSE_BRONZE_STORE = 'ndjson-append-volume' as const;

export const BODY_TEMPERATURE_TEMPLATE_ID = 'body_temperature.v2.p3_0b';

export const BODY_TEMPERATURE_TRIGGER_TYPE =
  'core.clinical.observation.vitals.body_temperature';
