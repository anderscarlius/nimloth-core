// Datatyper för openehr-composer.
//
// ClinicalEvent matchar det kontrakt P3.2 kommer konsumera från Kafka.
// I P3.1 simuleras events via direkta HTTP POST till /composer/event.

export interface ClinicalEvent {
  /** UUID, klient-genererad. Används för idempotency. */
  event_id: string;
  /** T.ex. "core.clinical.observation.vitals.body_temperature" */
  event_type: string;
  /** Svenskt personnummer (YYYYMMDD-NNNN). */
  patient_pnr: string;
  /** "melior" | "asynjavisph" | "manual" | "demo" */
  source_system: string;
  /** ISO-8601 timestamp för när händelsen *skedde*, inte processades. */
  occurred_at: string;
  /** Event-specifik nyttolast. Mappas till composition.content av composition-builder. */
  payload: Record<string, unknown>;
  /** Valfri: edge-instans ifall event kom via care-unit-edge. */
  source_instance?: string;
}

export interface ComposerStats {
  events_received: number;
  compositions_written: number;
  events_gap: number;
  events_failed: number;
  ehrs_created: number;
  started_at: string;
}

/** Resultat av en /composer/event-anrop. */
export interface EventResult {
  status: 'composed' | 'gap' | 'error';
  event_id: string;
  composition_uid?: string;
  ehr_id?: string;
  template_id?: string;
  reason?: string;
}
