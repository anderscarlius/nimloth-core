import express, { type Express, type Request, type Response } from 'express';
import type { HsaPerson, HsaUnit } from './catalog.js';

export interface HsaServerDeps {
  personsById: Map<string, HsaPerson>;
  unitsById: Map<string, HsaUnit>;
}

export function createServer(deps: HsaServerDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'hsa',
      persons: deps.personsById.size,
      units: deps.unitsById.size,
      synthetic: true,
    });
  });

  app.get('/person/:hsaId', (req: Request, res: Response) => {
    const person = deps.personsById.get(req.params.hsaId);
    if (!person) {
      res.status(404).json({ error: 'not_found', message: 'person not in synthetic catalog' });
      return;
    }
    res.json(person);
  });

  app.get('/unit/:hsaId', (req: Request, res: Response) => {
    const unit = deps.unitsById.get(req.params.hsaId);
    if (!unit) {
      res.status(404).json({ error: 'not_found', message: 'unit not in synthetic catalog' });
      return;
    }
    res.json(unit);
  });

  app.get('/person/:hsaId/roles', (req: Request, res: Response) => {
    const person = deps.personsById.get(req.params.hsaId);
    if (!person) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.json({ hsaId: person.hsaId, roles: [person.role] });
  });

  app.post('/validate', (req: Request, res: Response) => {
    const hsaId = typeof req.body?.hsaId === 'string' ? req.body.hsaId : '';
    const person = hsaId ? deps.personsById.get(hsaId) : undefined;
    res.json({ valid: Boolean(person), person: person ?? null });
  });

  return app;
}
