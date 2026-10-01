import type { CompositionCommittedEvent } from '@nimloth-core/shared';
import { LAKEHOUSE_BRONZE_STORE, LAKEHOUSE_DATA_CLASS } from './constants.js';

export interface LakehouseProvenance {
  source_system: string;
  source_instance: string;
  event_timestamp: string;
  template_id: string;
  trigger_event_id: string;
  trigger_event_type: string;
}

export interface BronzeCompositionRecord {
  layer: 'bronze';
  store: typeof LAKEHOUSE_BRONZE_STORE;
  data_class: typeof LAKEHOUSE_DATA_CLASS;
  ingested_at: string;
  provenance: LakehouseProvenance;
  /** Append-only raw domain event (CompositionCommitted v1). */
  raw: CompositionCommittedEvent;
}

export interface SilverBodyTemperatureRow {
  layer: 'silver';
  data_class: typeof LAKEHOUSE_DATA_CLASS;
  ingested_at: string;
  provenance: LakehouseProvenance;
  patient_id: string;
  composition_uid: string;
  openehr_path: string;
  magnitude: number;
  units: string;
}
