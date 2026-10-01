/** P3.0b node ids — aligned with openehr-composer event-mapper blood_pressure defaults. */
export const P3_VITALS_NODE_IDS = {
  history: 'at0001',
  event: 'at0006',
  itemTree: 'at0003',
  valueElement: 'at0004',
} as const;

export const BODY_TEMPERATURE_ARCHETYPE = 'openEHR-EHR-OBSERVATION.body_temperature.v2';

/** Tillplattad openEHR-path för body temperature magnitude (silver-kolumn). */
export function bodyTemperatureMagnitudePath(
  nodeIds: typeof P3_VITALS_NODE_IDS = P3_VITALS_NODE_IDS,
): string {
  return (
    `${BODY_TEMPERATURE_ARCHETYPE}/data[${nodeIds.history}]` +
    `/events[${nodeIds.event}]/data[${nodeIds.itemTree}]` +
    `/items[${nodeIds.valueElement}]/value/magnitude`
  );
}
