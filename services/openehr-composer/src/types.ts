// Datatyper för openehr-composer.
//
// B10 (2026-05-25): wire-format standardiserat till patient_id + timestamp.
// `patient_pnr` och `occurred_at` accepteras som deprecated aliases vid
// in-flödet (HTTP-route + Kafka-consumer) och normaliseras till canonical
// form innan den når någon konsument. DB-kolumner heter fortfarande
// `patient_pnr` — det ÄR personnummer-pseudonymet, och rename där ger
// inget värde mot migration-kostnaden.

export interface ClinicalEvent {
  /** UUID, klient-genererad. Används för idempotency. */
  event_id: string;
  /** T.ex. "core.clinical.observation.vitals.body_temperature" */
  event_type: string;
  /** Svenskt personnummer (YYYYMMDD-NNNN). B10: bytte namn från patient_pnr. */
  patient_id: string;
  /** "melior" | "asynjavisph" | "manual" | "demo" */
  source_system: string;
  /** ISO-8601 timestamp för när händelsen *skedde*, inte processades.
   *  B10: bytte namn från occurred_at. */
  timestamp: string;
  /** Event-specifik nyttolast. Mappas till composition.content av composition-builder. */
  payload: Record<string, unknown>;
  /** Valfri: edge-instans ifall event kom via care-unit-edge. */
  source_instance?: string;
}

/** Wire-format med båda nya och deprecated fältnamn. Används vid input-parsing. */
export interface ClinicalEventWire {
  event_id: string;
  event_type: string;
  patient_id?: string;
  /** @deprecated B10 — använd patient_id istället. */
  patient_pnr?: string;
  source_system: string;
  timestamp?: string;
  /** @deprecated B10 — använd timestamp istället. */
  occurred_at?: string;
  payload: Record<string, unknown>;
  source_instance?: string;
}

/**
 * Normalisera wire-format till canonical ClinicalEvent.
 * Returnerar `{ event, deprecatedFields }` så caller kan warn-logga.
 */
export function normalizeClinicalEvent(
  wire: ClinicalEventWire,
): { event: ClinicalEvent; deprecatedFields: string[] } {
  const deprecatedFields: string[] = [];
  const patient_id = wire.patient_id ?? wire.patient_pnr;
  const timestamp = wire.timestamp ?? wire.occurred_at;
  if (!wire.patient_id && wire.patient_pnr) deprecatedFields.push('patient_pnr → patient_id');
  if (!wire.timestamp && wire.occurred_at) deprecatedFields.push('occurred_at → timestamp');
  if (!patient_id) throw new Error('event saknar patient_id (och patient_pnr-alias)');
  if (!timestamp) throw new Error('event saknar timestamp (och occurred_at-alias)');
  return {
    event: {
      event_id: wire.event_id,
      event_type: wire.event_type,
      patient_id,
      source_system: wire.source_system,
      timestamp,
      payload: wire.payload,
      source_instance: wire.source_instance,
    },
    deprecatedFields,
  };
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
