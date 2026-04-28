import { Router, type Request, type Response } from 'express';
import type { EhrCache } from '../ehr-cache.js';

export function createEhrRouter(cache: EhrCache): Router {
  const r = Router();

  r.get('/:pnr', async (req: Request, res: Response) => {
    const pnr = req.params.pnr;
    if (!pnr || typeof pnr !== 'string') {
      res.status(400).json({ error: 'pnr required in path' });
      return;
    }
    try {
      const existing = await cache.lookup(pnr);
      if (existing) {
        res.json({ patient_pnr: pnr, ehr_id: existing, created: false });
        return;
      }
      const ehrId = await cache.getOrCreate(pnr);
      res.json({ patient_pnr: pnr, ehr_id: ehrId, created: true });
    } catch (err) {
      res.status(500).json({ error: 'ehr resolve failed', detail: String(err) });
    }
  });

  return r;
}
