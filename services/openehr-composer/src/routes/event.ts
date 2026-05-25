// POST /composer/event — ta emot ClinicalEvent.
//
// P3.2-uppdatering: route skriver till composer_outbox FÖRST (för
// spårbarhet, idempotency mot event_id, och konsistens med Kafka-vägen),
// och dispatchar sedan synkront mot EHRbase.
//
// Avvikelse från P3.2-spec sektion 4.7b: specen sade returnera 202
// Accepted (asynkron processing). Vi behåller synkron processing + 201
// med composition_uid för att inte bryta P3.1:s 8 smoke-tester (AC11).
// Outbox-spårning är ändå komplett. Dokumenterat i P3.2-REPORT.md.

import { Router, type Request, type Response } from 'express';
import type { Logger } from 'pino';
import type { ClinicalEvent, EventResult } from '../types.js';
import type { EhrCache } from '../ehr-cache.js';
import type { EhrbaseClient } from '../ehrbase-client.js';
import type { GapTracker } from '../gap-tracker.js';
import type { OutboxWriter } from '../outbox/writer.js';
import type { Pool } from '../db.js';
import { mapEventToTemplate, isKnownGap } from '../event-mapper.js';
import { buildComposition } from '../composition-builder.js';

export interface EventDeps {
  pool: Pool;
  cache: EhrCache;
  ehrbase: EhrbaseClient;
  gaps: GapTracker;
  outbox: OutboxWriter;
  logger: Logger;
  stats: {
    events_received: number;
    compositions_written: number;
    events_gap: number;
    events_failed: number;
  };
}

export function createEventRouter(deps: EventDeps): Router {
  const r = Router();
  r.post('/', async (req: Request, res: Response) => {
    const wire = req.body as Partial<import('../types.js').ClinicalEventWire> | undefined;
    if (
      !wire ||
      typeof wire.event_id !== 'string' ||
      typeof wire.event_type !== 'string' ||
      !wire.payload ||
      typeof wire.payload !== 'object' ||
      // accept either new or deprecated field-names
      (typeof wire.patient_id !== 'string' && typeof wire.patient_pnr !== 'string') ||
      (typeof wire.timestamp !== 'string' && typeof wire.occurred_at !== 'string')
    ) {
      res.status(400).json({
        error: 'expected ClinicalEvent { event_id, event_type, patient_id, timestamp, payload, ... }',
      });
      return;
    }
    // B10: normalize deprecated aliases (patient_pnr → patient_id, occurred_at → timestamp).
    let e: ClinicalEvent;
    try {
      const norm = (await import('../types.js')).normalizeClinicalEvent(
        wire as import('../types.js').ClinicalEventWire,
      );
      e = norm.event;
      if (norm.deprecatedFields.length > 0) {
        deps.logger.warn(
          { event_id: e.event_id, deprecated: norm.deprecatedFields },
          'event uses deprecated field names — B10 alias path',
        );
      }
    } catch (err) {
      res.status(400).json({ error: String(err) });
      return;
    }
    deps.stats.events_received += 1;

    // 0. Skriv till outbox FÖRST — idempotent på event_id.
    //    Om samma event_id redan komponerats: returnera "already processed".
    let outboxRow;
    try {
      const result = await deps.outbox.write(e, 'http');
      outboxRow = result.record;
      if (!result.created && outboxRow.status === 'completed') {
        const replay: EventResult = {
          status: 'composed',
          event_id: e.event_id,
          ehr_id: outboxRow.ehrId ?? undefined,
          composition_uid: outboxRow.compositionUid ?? undefined,
          template_id: undefined,
          reason: 'idempotent replay — event redan komponerat',
        };
        res.status(200).json(replay);
        return;
      }
    } catch (err) {
      deps.stats.events_failed += 1;
      deps.logger.error({ err: String(err), event_id: e.event_id }, 'outbox write failed');
      res.status(500).json({ status: 'error', event_id: e.event_id, reason: `outbox: ${String(err)}` });
      return;
    }

    // 1. Resolva EHR
    let ehrId: string;
    try {
      ehrId = await deps.cache.getOrCreate(e.patient_id);
    } catch (err) {
      deps.stats.events_failed += 1;
      deps.logger.error({ err: String(err), event_id: e.event_id }, 'ehr resolve failed');
      await markOutboxFailed(deps, outboxRow.id, `EHR resolve: ${String(err)}`);
      const result: EventResult = { status: 'error', event_id: e.event_id, reason: `EHR resolve: ${String(err)}` };
      res.status(502).json(result);
      return;
    }

    // 2. Mappning
    const mapping = mapEventToTemplate(e);
    if (!mapping) {
      const reason = isKnownGap(e.event_type)
        ? 'event-type är känt gap (EVALUATION-templates kommer i P3.0b)'
        : 'okänd event-type — mapping saknas';
      deps.gaps.log('no_template_mapping', e.event_type, reason);
      deps.stats.events_gap += 1;
      await markOutboxSkipped(deps, outboxRow.id, reason);
      const result: EventResult = { status: 'gap', event_id: e.event_id, ehr_id: ehrId, reason };
      res.status(202).json(result);
      return;
    }

    // 3. Bygg composition
    let composition: Record<string, unknown>;
    try {
      composition = buildComposition(e, mapping, deps.gaps);
    } catch (err) {
      deps.stats.events_failed += 1;
      deps.logger.error({ err: String(err), event_id: e.event_id }, 'composition build failed');
      await markOutboxFailed(deps, outboxRow.id, `build: ${String(err)}`);
      const result: EventResult = {
        status: 'error',
        event_id: e.event_id,
        ehr_id: ehrId,
        reason: `build: ${String(err)}`,
      };
      res.status(500).json(result);
      return;
    }

    // 4. Skicka till EHRbase + markera outbox-rad completed
    try {
      const uid = await deps.ehrbase.postComposition(ehrId, mapping.templateId, composition);
      deps.stats.compositions_written += 1;
      await markOutboxCompleted(deps, outboxRow.id, uid, ehrId);
      const result: EventResult = {
        status: 'composed',
        event_id: e.event_id,
        ehr_id: ehrId,
        composition_uid: uid ?? undefined,
        template_id: mapping.templateId,
      };
      res.status(201).json(result);
    } catch (err) {
      deps.gaps.log('composition_rejected', e.event_type, String(err), [mapping.templateId]);
      deps.stats.events_failed += 1;
      deps.logger.warn({ err: String(err), event_id: e.event_id, template: mapping.templateId }, 'EHRbase rejected composition');
      await markOutboxFailed(deps, outboxRow.id, String(err));
      const result: EventResult = {
        status: 'error',
        event_id: e.event_id,
        ehr_id: ehrId,
        template_id: mapping.templateId,
        reason: String(err),
      };
      res.status(422).json(result);
    }
  });
  return r;
}

async function markOutboxCompleted(
  deps: EventDeps,
  id: number,
  uid: string | null,
  ehrId: string,
): Promise<void> {
  await deps.pool.query(
    `UPDATE composer_outbox
        SET status = 'completed',
            composition_uid = $2,
            ehr_id = $3,
            processed_at = now()
      WHERE id = $1`,
    [id, uid, ehrId],
  );
}

async function markOutboxFailed(deps: EventDeps, id: number, reason: string): Promise<void> {
  await deps.pool.query(
    `UPDATE composer_outbox
        SET status = 'failed',
            attempts = attempts + 1,
            last_error = $2,
            processed_at = now()
      WHERE id = $1`,
    [id, reason.slice(0, 1000)],
  );
}

async function markOutboxSkipped(deps: EventDeps, id: number, reason: string): Promise<void> {
  await deps.pool.query(
    `UPDATE composer_outbox
        SET status = 'skipped',
            last_error = $2,
            processed_at = now()
      WHERE id = $1`,
    [id, reason.slice(0, 1000)],
  );
}
