// FHIR Patient-resurs: render, sök, hämta.

import type pg from 'pg';
import { Router } from 'express';
import type { FhirPatient, FhirBundle } from '@nimloth-core/shared/types';
import type { StoreRouter } from '../stores/index.js';
import { storeContextFromRequest } from '../stores/store-context.js';

export const PATIENT_IDENTIFIER_SYSTEM = 'urn:oid:1.2.752.129.2.1.3.1';

interface PatientRow {
  personnummer: string;
  fornamn: string | null;
  efternamn: string | null;
  fodelsedatum: Date | string | null;
  kon: string | null;
  adress: string | null;
  postnr: string | null;
  postort: string | null;
  telefon: string | null;
  source_systems: string[] | null;
  updated_at: Date | string;
}

export function renderPatient(row: PatientRow): FhirPatient {
  const birthDate =
    row.fodelsedatum instanceof Date
      ? row.fodelsedatum.toISOString().slice(0, 10)
      : (row.fodelsedatum ?? undefined) || undefined;
  return {
    resourceType: 'Patient',
    id: row.personnummer,
    meta: {
      versionId: '1',
      lastUpdated: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
      source: row.source_systems?.[0],
    },
    identifier: [{ system: PATIENT_IDENTIFIER_SYSTEM, value: row.personnummer }],
    active: true,
    name: [
      {
        family: row.efternamn ?? undefined,
        given: row.fornamn ? [row.fornamn] : undefined,
        text: [row.fornamn, row.efternamn].filter(Boolean).join(' '),
      },
    ],
    gender: row.kon === 'K' ? 'female' : row.kon === 'M' ? 'male' : 'unknown',
    birthDate,
    address: row.adress
      ? [
          {
            line: [row.adress],
            postalCode: row.postnr ?? undefined,
            city: row.postort ?? undefined,
            country: 'SE',
          },
        ]
      : undefined,
    telecom: row.telefon ? [{ system: 'phone', value: row.telefon }] : undefined,
  };
}

export async function findPatientById(pool: pg.Pool, id: string): Promise<PatientRow | null> {
  const r = await pool.query<PatientRow>(
    `SELECT * FROM fhir_patients WHERE personnummer = $1 LIMIT 1`,
    [id],
  );
  return r.rows[0] ?? null;
}

export async function searchPatients(
  pool: pg.Pool,
  params: { identifier?: string; family?: string; given?: string; limit?: number },
): Promise<PatientRow[]> {
  const limit = Math.min(params.limit ?? 50, 200);
  if (params.identifier) {
    const r = await pool.query<PatientRow>(
      `SELECT * FROM fhir_patients WHERE personnummer = $1 LIMIT $2`,
      [params.identifier, limit],
    );
    return r.rows;
  }
  if (params.family || params.given) {
    const r = await pool.query<PatientRow>(
      `SELECT * FROM fhir_patients
       WHERE ($1::text IS NULL OR efternamn ILIKE $1)
         AND ($2::text IS NULL OR fornamn ILIKE $2)
       ORDER BY efternamn, fornamn LIMIT $3`,
      [params.family ? `%${params.family}%` : null, params.given ? `%${params.given}%` : null, limit],
    );
    return r.rows;
  }
  const r = await pool.query<PatientRow>(
    `SELECT * FROM fhir_patients ORDER BY updated_at DESC LIMIT $1`,
    [limit],
  );
  return r.rows;
}

export interface ResourceRouterDeps {
  pool: pg.Pool;
  storeRouter: StoreRouter;
}

export function patientRouter(deps: ResourceRouterDeps): Router {
  const { storeRouter } = deps;
  const router = Router();
  router.get('/', async (req, res, next) => {
    try {
      const store = storeRouter.primary;
      req.canonicalStore = store.canonicalStore;
      const patients = await store.searchPatients(
        {
          identifier: typeof req.query.identifier === 'string' ? req.query.identifier : undefined,
          family: typeof req.query.family === 'string' ? req.query.family : undefined,
          given: typeof req.query.given === 'string' ? req.query.given : undefined,
          limit: req.query._count ? Number(req.query._count) : undefined,
        },
        storeContextFromRequest(req),
      );
      const bundle: FhirBundle = {
        resourceType: 'Bundle',
        type: 'searchset',
        total: patients.length,
        entry: patients.map((p) => ({ resource: p, search: { mode: 'match' } })),
      };
      res.type('application/fhir+json').json(bundle);
    } catch (err) {
      next(err);
    }
  });
  router.get('/:id', async (req, res, next) => {
    try {
      const store = storeRouter.primary;
      req.canonicalStore = store.canonicalStore;
      const patient = await store.getPatient(req.params.id, storeContextFromRequest(req));
      if (!patient) return notFound(res, 'Patient', req.params.id);
      return res.type('application/fhir+json').json(patient);
    } catch (err) {
      return next(err);
    }
  });
  return router;
}

export function notFound(res: import('express').Response, resource: string, id: string): void {
  res.status(404).type('application/fhir+json').json({
    resourceType: 'OperationOutcome',
    issue: [
      {
        severity: 'error',
        code: 'not-found',
        diagnostics: `${resource}/${id} not found`,
      },
    ],
  });
}
