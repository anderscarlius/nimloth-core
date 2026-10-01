import type { CompositionCommittedEvent } from '@nimloth-core/shared';
import { LAKEHOUSE_BRONZE_STORE, LAKEHOUSE_DATA_CLASS } from './constants.js';
import type { BronzeCompositionRecord } from './types.js';

export function buildBronzeCompositionRecord(
  event: CompositionCommittedEvent,
  ingestedAt: string = new Date().toISOString(),
): BronzeCompositionRecord {
  return {
    layer: 'bronze',
    store: LAKEHOUSE_BRONZE_STORE,
    data_class: LAKEHOUSE_DATA_CLASS,
    ingested_at: ingestedAt,
    provenance: {
      source_system: event.source_system,
      source_instance: event.source_instance ?? 'core',
      event_timestamp: event.timestamp,
      template_id: event.payload.template_id,
      trigger_event_id: event.payload.trigger_event_id,
      trigger_event_type: event.payload.trigger_event_type,
    },
    raw: event,
  };
}

export function serializeBronzeLine(record: BronzeCompositionRecord): string {
  return `${JSON.stringify(record)}\n`;
}
