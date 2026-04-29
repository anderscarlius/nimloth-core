// OutboxWriter — skriver ClinicalEvent till composer_outbox.
//
// Idempotent: ON CONFLICT (event_id) DO NOTHING. Vid konflikt återläser vi
// existing rad. created-flaggan skiljer "ny" från "redan inne".

import type { Pool } from 'pg';
import type { ClinicalEvent } from '../types.js';
import type { OutboxRecord, OutboxRow } from './types.js';
import { rowToRecord } from './types.js';

export interface KafkaContext {
  topic: string;
  partition: number;
  offset: string;
}

export class OutboxWriter {
  constructor(private readonly pool: Pool) {}

  async write(
    event: ClinicalEvent,
    source: 'kafka' | 'http',
    kafkaContext?: KafkaContext,
  ): Promise<{ record: OutboxRecord; created: boolean }> {
    const inserted = await this.pool.query<OutboxRow>(
      `INSERT INTO composer_outbox
         (event_id, event_type, patient_pnr, payload, source,
          kafka_topic, kafka_partition, kafka_offset)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8)
       ON CONFLICT (event_id) DO NOTHING
       RETURNING *`,
      [
        event.event_id,
        event.event_type,
        event.patient_pnr,
        JSON.stringify(event),
        source,
        kafkaContext?.topic ?? null,
        kafkaContext?.partition ?? null,
        kafkaContext?.offset ?? null,
      ],
    );

    if (inserted.rows.length > 0) {
      return { record: rowToRecord(inserted.rows[0]), created: true };
    }

    // Konflikt — hämta existing
    const existing = await this.pool.query<OutboxRow>(
      'SELECT * FROM composer_outbox WHERE event_id = $1',
      [event.event_id],
    );
    if (existing.rows.length === 0) {
      throw new Error(`OutboxWriter: race-loss för event_id ${event.event_id} men post saknas`);
    }
    return { record: rowToRecord(existing.rows[0]), created: false };
  }
}
