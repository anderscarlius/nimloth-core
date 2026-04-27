// Minimal FHIR R4-server för care-unit-edge.
// Använder bara SQLite-data — inga upstream-anrop. Det är hela poängen
// med en care-unit-edge: den ska vara fullt funktionell offline.
//
// Kontraktet är samma som central FHIR Facade men med snävare yta —
// de endpoints klinikern använder under ett offline-fönster.

import express, { type Request, type Response } from 'express';
import type { Logger } from 'pino';
import type { CareUnitDb } from './db.js';

export function createFhirServer(deps: {
  db: CareUnitDb;
  logger: Logger;
  unitId: string;
  unitHsaId: string;
}): express.Express {
  const app = express();
  app.use(express.json({ limit: '512kb' }));

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'care-unit-edge-fhir',
      unit_id: deps.unitId,
      patients_cached: deps.db.countPatients(),
    });
  });

  app.get('/fhir/r4/metadata', (_req, res) => {
    res.json({
      resourceType: 'CapabilityStatement',
      status: 'active',
      kind: 'instance',
      software: { name: 'Nimloth Core Care-Unit-Edge', version: '0.1.0' },
      implementation: { description: `Care-unit-edge ${deps.unitId}` },
      fhirVersion: '4.0.1',
      format: ['json'],
    });
  });

  app.get('/fhir/r4/Patient', (req: Request, res: Response) => {
    const identifier = String(req.query.identifier ?? '').trim();
    if (!identifier) {
      res.status(400).json({ resourceType: 'OperationOutcome', issue: [{ severity: 'error', code: 'invalid', diagnostics: 'identifier required' }] });
      return;
    }
    const p = deps.db.findPatientByPnr(identifier);
    if (!p) {
      res.json({ resourceType: 'Bundle', type: 'searchset', total: 0, entry: [] });
      return;
    }
    res.json({
      resourceType: 'Bundle',
      type: 'searchset',
      total: 1,
      entry: [
        {
          resource: {
            resourceType: 'Patient',
            id: p.personnummer,
            identifier: [{ system: 'urn:oid:1.2.752.129.2.1.3.1', value: p.personnummer }],
            name: [
              {
                text: `${p.fornamn ?? ''} ${p.efternamn ?? ''}`.trim() || p.personnummer,
                given: p.fornamn ? [p.fornamn] : undefined,
                family: p.efternamn ?? undefined,
              },
            ],
            birthDate: p.fodelsedatum ?? undefined,
            gender: p.kon === 'K' ? 'female' : p.kon === 'M' ? 'male' : 'unknown',
          },
        },
      ],
    });
  });

  // Express path-to-regexp 0.1.x tolkar $ som regex-anchor i strängbaserade
  // routes — vi använder därför en explicit regex för $everything-operationen.
  app.get(/^\/fhir\/r4\/Patient\/([^/]+)\/\$everything$/, (req, res) => {
    const pnr = (req.params as unknown as Record<string, string>)['0'];
    const patient = deps.db.findPatientByPnr(pnr);
    if (!patient) {
      res.status(404).json({ resourceType: 'OperationOutcome', issue: [{ severity: 'error', code: 'not-found' }] });
      return;
    }
    const otherResources = deps.db.listResourcesForPatient(pnr);
    res.json({
      resourceType: 'Bundle',
      type: 'searchset',
      total: 1 + otherResources.length,
      entry: [
        {
          resource: {
            resourceType: 'Patient',
            id: patient.personnummer,
            name: [{ text: `${patient.fornamn ?? ''} ${patient.efternamn ?? ''}`.trim() || patient.personnummer }],
            birthDate: patient.fodelsedatum ?? undefined,
            gender: patient.kon === 'K' ? 'female' : patient.kon === 'M' ? 'male' : 'unknown',
          },
        },
        ...otherResources.map((r) => ({ resource: r.resource })),
      ],
    });
  });

  return app;
}
