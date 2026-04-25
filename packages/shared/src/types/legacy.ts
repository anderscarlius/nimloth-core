// Legacy-typer (behålls av bakåtkompatibilitet).

/** Metadata om en källsysteminstans (se instance_metadata-tabellen). */
export interface InstanceMetadata {
  instanceId: string;
  instanceName: string;
  hospitalName: string;
  hsaId: string;
}

/** Generisk event-envelope — använd hellre ClinicalEvent eller BaseEvent. */
export interface EventEnvelope<T = unknown> {
  eventId: string;
  eventType: string;
  instanceId: string;
  timestamp: string;
  payload: T;
}
