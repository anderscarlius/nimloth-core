import { Router } from 'express';
import type { EhrbaseClient } from '../ehrbase-client.js';
import { listMappings, KNOWN_GAP_EVENT_TYPES } from '../event-mapper.js';

export function createTemplatesRouter(ehrbase: EhrbaseClient): Router {
  const r = Router();
  r.get('/', async (_req, res) => {
    let loaded: Awaited<ReturnType<EhrbaseClient['listTemplates']>> = [];
    let ehrbaseError: string | null = null;
    try {
      loaded = await ehrbase.listTemplates();
    } catch (err) {
      ehrbaseError = String(err);
    }
    res.json({
      mappings: listMappings(),
      known_gaps: [...KNOWN_GAP_EVENT_TYPES],
      ehrbase: { loaded, error: ehrbaseError },
    });
  });
  return r;
}
