// POST /composer/event — ta emot ClinicalEvent, skriv composition mot EHRbase.

import { Router, type Request, type Response } from 'express';
import type { Logger } from 'pino';
import type { ClinicalEvent, EventResult } from '../types.js';
import type { EhrCache } from '../ehr-cache.js';
import type { EhrbaseClient } from '../ehrbase-client.js';
import type { GapTracker } from '../gap-tracker.js';
import { mapEventToTemplate, isKnownGap } from '../event-mapper.js';
import { buildComposition } from '../composition-builder.js';

export interface EventDeps {
  cache: EhrCache;
  ehrbase: EhrbaseClient;
  gaps: GapTracker;
  logger: Logger;
  stats: { events_received: number; compositions_written: number; events_gap: number; events_failed: number };
}

export function createEventRouter(deps: EventDeps): Router {
  const r = Router();
  r.post('/', async (req: Request, res: Response) => {
    const event = req.body as Partial<ClinicalEvent> | undefined;
    if (!event || typeof event.event_id !== 'string' || typeof event.event_type !== 'string' ||
        typeof event.patient_pnr !== 'string' || typeof event.occurred_at !== 'string' ||
        !event.payload || typeof event.payload !== 'object') {
      res.status(400).json({ error: 'expected ClinicalEvent { event_id, event_type, patient_pnr, occurred_at, payload, ... }' });
      return;
    }
    const e = event as ClinicalEvent;
    deps.stats.events_received += 1;

    // 1. Resolva EHR
    let ehrId: string;
    try {
      ehrId = await deps.cache.getOrCreate(e.patient_pnr);
    } catch (err) {
      deps.stats.events_failed += 1;
      deps.logger.error({ err: String(err), event_id: e.event_id }, 'ehr resolve failed');
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
      const result: EventResult = { status: 'gap', event_id: e.event_id, ehr_id: ehrId, reason };
      res.status(202).json(result); // 202 = accepted men inte committed
      return;
    }

    // 3. Bygg composition
    let composition: Record<string, unknown>;
    try {
      composition = buildComposition(e, mapping, deps.gaps);
    } catch (err) {
      deps.stats.events_failed += 1;
      deps.logger.error({ err: String(err), event_id: e.event_id }, 'composition build failed');
      const result: EventResult = { status: 'error', event_id: e.event_id, ehr_id: ehrId, reason: `build: ${String(err)}` };
      res.status(500).json(result);
      return;
    }

    // 4. Skicka till EHRbase
    try {
      const uid = await deps.ehrbase.postComposition(ehrId, mapping.templateId, composition);
      deps.stats.compositions_written += 1;
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
