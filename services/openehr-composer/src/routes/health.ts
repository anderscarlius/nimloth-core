import { Router } from 'express';

export function createHealthRouter(): Router {
  const r = Router();
  r.get('/', (_req, res) => {
    res.json({ status: 'ok', service: 'openehr-composer' });
  });
  return r;
}
