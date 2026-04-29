// Outbox-typer (Sprint 2 P3.2).

import type { ClinicalEvent } from '../types.js';

export type OutboxStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'skipped';
export type OutboxSource = 'kafka' | 'http';

export interface OutboxRecord {
  id: number;
  eventId: string;
  eventType: string;
  patientPnr: string;
  payload: ClinicalEvent;
  source: OutboxSource;
  kafkaTopic: string | null;
  kafkaPartition: number | null;
  kafkaOffset: bigint | null;
  status: OutboxStatus;
  attempts: number;
  lastError: string | null;
  compositionUid: string | null;
  ehrId: string | null;
  createdAt: Date;
  processedAt: Date | null;
}

/** Rådata från Postgres innan typad mappning. */
export interface OutboxRow {
  id: string | number;
  event_id: string;
  event_type: string;
  patient_pnr: string;
  payload: ClinicalEvent | string;
  source: OutboxSource;
  kafka_topic: string | null;
  kafka_partition: number | null;
  kafka_offset: string | null;
  status: OutboxStatus;
  attempts: number;
  last_error: string | null;
  composition_uid: string | null;
  ehr_id: string | null;
  created_at: Date;
  processed_at: Date | null;
}

export function rowToRecord(row: OutboxRow): OutboxRecord {
  return {
    id: typeof row.id === 'string' ? Number(row.id) : row.id,
    eventId: row.event_id,
    eventType: row.event_type,
    patientPnr: row.patient_pnr,
    payload: typeof row.payload === 'string' ? (JSON.parse(row.payload) as ClinicalEvent) : row.payload,
    source: row.source,
    kafkaTopic: row.kafka_topic,
    kafkaPartition: row.kafka_partition,
    kafkaOffset: row.kafka_offset != null ? BigInt(row.kafka_offset) : null,
    status: row.status,
    attempts: row.attempts,
    lastError: row.last_error,
    compositionUid: row.composition_uid,
    ehrId: row.ehr_id,
    createdAt: row.created_at,
    processedAt: row.processed_at,
  };
}
