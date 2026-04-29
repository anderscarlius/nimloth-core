import type pg from 'pg';
import { Router } from 'express';
import type { FhirMedicationStatement, FhirBundle } from '@nimloth-core/shared/types';
import { notFound, type ResourceRouterDeps } from './patient.js';
import { storeContextFromRequest } from '../stores/store-context.js';

interface MedicationRow {
  medication_id: string;
  event_id: string;
  patient_pnr: string;
  atc_code: string | null;
  drug_name: string | null;
  strength: string | null;
  dosage: string | null;
  route: string | null;
  frequency: string | null;
  start_date: Date | string | null;
  end_date: Date | string | null;
  status: string;
  encounter_ref: string | null;
  created_at: Date | string;
}

const STATUS_MAP: Record<string, FhirMedicationStatement['status']> = {
  ACTIVE: 'active',
  COMPLETED: 'completed',
  CANCELLED: 'entered-in-error',
  SUSPENDED: 'on-hold',
};

function asDateStr(d: Date | string | null): string | undefined {
  if (!d) return undefined;
  return d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
}

export function renderMedicationStatement(row: MedicationRow): FhirMedicationStatement {
  return {
    resourceType: 'MedicationStatement',
    id: row.medication_id,
    meta: { versionId: '1', lastUpdated: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at) },
    status: STATUS_MAP[row.status] ?? 'active',
    medicationCodeableConcept: {
      coding: row.atc_code
        ? [{ system: 'http://whocc.no/atc', code: row.atc_code, display: row.drug_name ?? row.atc_code }]
        : undefined,
      text: [row.drug_name, row.strength].filter(Boolean).join(' '),
    },
    subject: { reference: `Patient/${row.patient_pnr}` },
    effectivePeriod: {
      start: asDateStr(row.start_date),
      end: asDateStr(row.end_date),
    },
    dateAsserted: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    dosage: [
      {
        text: `${row.dosage ?? ''} ${row.route ? `(${row.route})` : ''}`.trim(),
        route: row.route
          ? { coding: [{ system: 'http://hl7.org/fhir/administration-method-codes', code: row.route }] }
          : undefined,
      },
    ],
  };
}

export async function findMedicationsByPatient(
  pool: pg.Pool,
  pnr: string,
  status?: string,
  limit = 100,
): Promise<MedicationRow[]> {
  const statusUpper = status?.toUpperCase();
  const r = await pool.query<MedicationRow>(
    `SELECT * FROM fhir_medication_statements
     WHERE patient_pnr = $1
       AND ($2::text IS NULL OR status = $2)
     ORDER BY start_date DESC NULLS LAST LIMIT $3`,
    [pnr, statusUpper ?? null, limit],
  );
  return r.rows;
}

export async function findMedicationById(pool: pg.Pool, id: string): Promise<MedicationRow | null> {
  const r = await pool.query<MedicationRow>(
    `SELECT * FROM fhir_medication_statements WHERE medication_id = $1`,
    [id],
  );
  return r.rows[0] ?? null;
}

export function medicationStatementRouter(deps: ResourceRouterDeps): Router {
  const { pool, storeRouter } = deps;
  const router = Router();
  router.get('/', async (req, res, next) => {
    try {
      const patient = typeof req.query.patient === 'string' ? req.query.patient : undefined;
      if (!patient) {
        return res.status(400).type('application/fhir+json').json({
          resourceType: 'OperationOutcome',
          issue: [{ severity: 'error', code: 'invalid', diagnostics: 'patient parameter required' }],
        });
      }
      const count = req.query._count ? Number(req.query._count) : undefined;

      const store = storeRouter.primary;
      req.canonicalStore = store.canonicalStore;
      const items = await store.searchMedicationStatements(
        { patient, limit: count },
        storeContextFromRequest(req),
      );
      const bundle: FhirBundle = {
        resourceType: 'Bundle',
        type: 'searchset',
        total: items.length,
        entry: items.map((m) => ({ resource: m, search: { mode: 'match' } })),
      };
      return res.type('application/fhir+json').json(bundle);
    } catch (err) {
      return next(err);
    }
  });
  // /:id-uppslag är postgres-only i Sprint 2 (se observation.ts för rationale).
  router.get('/:id', async (req, res, next) => {
    try {
      req.canonicalStore = 'postgres';
      const row = await findMedicationById(pool, req.params.id);
      if (!row) return notFound(res, 'MedicationStatement', req.params.id);
      return res.type('application/fhir+json').json(renderMedicationStatement(row));
    } catch (err) {
      return next(err);
    }
  });
  return router;
}
