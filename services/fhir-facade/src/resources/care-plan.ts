// CarePlan — för Del 7 returnerar vi en tom searchset.
// Full implementation i Prompt 8+ (kräver CarePlan-events från källsystemen,
// vilket inte finns i Melior-schemat i denna PoC).

import type pg from 'pg';
import { Router } from 'express';
import type { FhirBundle } from '@nimloth-core/shared/types';
import { notFound } from './patient.js';

export function carePlanRouter(_pool: pg.Pool): Router {
  const router = Router();
  router.get('/', async (req, res) => {
    if (typeof req.query.patient !== 'string') {
      return res.status(400).type('application/fhir+json').json({
        resourceType: 'OperationOutcome',
        issue: [{ severity: 'error', code: 'invalid', diagnostics: 'patient parameter required' }],
      });
    }
    const bundle: FhirBundle = {
      resourceType: 'Bundle',
      type: 'searchset',
      total: 0,
      entry: [],
    };
    return res.type('application/fhir+json').json(bundle);
  });
  router.get('/:id', (req, res) => notFound(res, 'CarePlan', req.params.id));
  return router;
}
