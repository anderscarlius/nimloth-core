import type pg from 'pg';
import { Router } from 'express';
import type { FhirEncounter, FhirBundle } from '@nimloth-core/shared/types';
import { notFound } from './patient.js';

interface EncounterRow {
  encounter_ref: string;
  patient_pnr: string;
  encounter_type: string | null;
  department_code: string | null;
  department_name: string | null;
  admission_date: Date | string | null;
  discharge_date: Date | string | null;
  status: string | null;
  updated_at: Date | string;
}

function toIso(d: Date | string | null | undefined): string | undefined {
  if (!d) return undefined;
  return d instanceof Date ? d.toISOString() : String(d);
}

const STATUS_MAP: Record<string, FhirEncounter['status']> = {
  ACTIVE: 'in-progress',
  DISCHARGED: 'finished',
  CANCELLED: 'cancelled',
};

const CLASS_MAP: Record<string, { code: string; display: string }> = {
  INPATIENT: { code: 'IMP', display: 'inpatient encounter' },
  OUTPATIENT: { code: 'AMB', display: 'ambulatory' },
  EMERGENCY: { code: 'EMER', display: 'emergency' },
  DAYCARE: { code: 'ACUTE', display: 'inpatient acute' },
};

export function renderEncounter(row: EncounterRow): FhirEncounter {
  const cls = CLASS_MAP[row.encounter_type ?? 'OUTPATIENT'] ?? CLASS_MAP.OUTPATIENT;
  return {
    resourceType: 'Encounter',
    id: row.encounter_ref,
    meta: { versionId: '1', lastUpdated: toIso(row.updated_at)! },
    status: STATUS_MAP[row.status ?? 'ACTIVE'] ?? 'in-progress',
    class: {
      system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
      code: cls.code,
      display: cls.display,
    },
    subject: { reference: `Patient/${row.patient_pnr}` },
    period: {
      start: toIso(row.admission_date),
      end: toIso(row.discharge_date),
    },
    serviceProvider: row.department_code
      ? { reference: `Organization/${row.department_code}`, display: row.department_name ?? row.department_code }
      : undefined,
  };
}

export async function findEncountersByPatient(pool: pg.Pool, pnr: string, limit = 100): Promise<EncounterRow[]> {
  const r = await pool.query<EncounterRow>(
    `SELECT * FROM fhir_encounters WHERE patient_pnr = $1 ORDER BY admission_date DESC NULLS LAST LIMIT $2`,
    [pnr, limit],
  );
  return r.rows;
}

export async function findEncounterById(pool: pg.Pool, id: string): Promise<EncounterRow | null> {
  const r = await pool.query<EncounterRow>(`SELECT * FROM fhir_encounters WHERE encounter_ref = $1`, [id]);
  return r.rows[0] ?? null;
}

export function encounterRouter(pool: pg.Pool): Router {
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
      const rows = await findEncountersByPatient(pool, patient);
      const bundle: FhirBundle = {
        resourceType: 'Bundle',
        type: 'searchset',
        total: rows.length,
        entry: rows.map((r) => ({ resource: renderEncounter(r), search: { mode: 'match' } })),
      };
      return res.type('application/fhir+json').json(bundle);
    } catch (err) {
      return next(err);
    }
  });
  router.get('/:id', async (req, res, next) => {
    try {
      const row = await findEncounterById(pool, req.params.id);
      if (!row) return notFound(res, 'Encounter', req.params.id);
      return res.type('application/fhir+json').json(renderEncounter(row));
    } catch (err) {
      return next(err);
    }
  });
  return router;
}
