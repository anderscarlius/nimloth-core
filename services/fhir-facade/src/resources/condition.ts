import type pg from 'pg';
import { Router } from 'express';
import type { FhirCondition, FhirBundle } from '@nimloth-core/shared/types';
import { notFound } from './patient.js';

interface ConditionRow {
  condition_id: string;
  event_id: string;
  patient_pnr: string;
  icd_code: string | null;
  display: string | null;
  diagnosis_type: string | null;
  onset_at: Date | string | null;
  resolved_at: Date | string | null;
  encounter_ref: string | null;
  created_at: Date | string;
}

function toIso(d: Date | string | null | undefined): string | undefined {
  if (!d) return undefined;
  return d instanceof Date ? d.toISOString() : String(d);
}

export function renderCondition(row: ConditionRow): FhirCondition {
  return {
    resourceType: 'Condition',
    id: row.condition_id,
    meta: { versionId: '1', lastUpdated: toIso(row.created_at)! },
    clinicalStatus: {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
          code: row.resolved_at ? 'resolved' : 'active',
        },
      ],
    },
    verificationStatus: {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status',
          code: 'confirmed',
        },
      ],
    },
    category: row.diagnosis_type
      ? [
          {
            coding: [
              {
                system: 'https://core.nimloth.io/fhir/CodeSystem/diagnosis-type',
                code: row.diagnosis_type,
              },
            ],
          },
        ]
      : undefined,
    code: row.icd_code
      ? {
          coding: [
            {
              system: 'http://hl7.org/fhir/sid/icd-10-se',
              code: row.icd_code,
              display: row.display ?? row.icd_code,
            },
          ],
          text: row.display ?? undefined,
        }
      : undefined,
    subject: { reference: `Patient/${row.patient_pnr}` },
    encounter: row.encounter_ref ? { reference: `Encounter/${row.encounter_ref}` } : undefined,
    onsetDateTime: toIso(row.onset_at),
    recordedDate: toIso(row.created_at),
  };
}

export async function findConditionsByPatient(pool: pg.Pool, pnr: string, limit = 100): Promise<ConditionRow[]> {
  const r = await pool.query<ConditionRow>(
    `SELECT * FROM fhir_conditions WHERE patient_pnr = $1 ORDER BY onset_at DESC NULLS LAST LIMIT $2`,
    [pnr, limit],
  );
  return r.rows;
}

export async function findConditionById(pool: pg.Pool, id: string): Promise<ConditionRow | null> {
  const r = await pool.query<ConditionRow>(`SELECT * FROM fhir_conditions WHERE condition_id = $1`, [id]);
  return r.rows[0] ?? null;
}

export function conditionRouter(pool: pg.Pool): Router {
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
      const rows = await findConditionsByPatient(pool, patient);
      const bundle: FhirBundle = {
        resourceType: 'Bundle',
        type: 'searchset',
        total: rows.length,
        entry: rows.map((r) => ({ resource: renderCondition(r), search: { mode: 'match' } })),
      };
      return res.type('application/fhir+json').json(bundle);
    } catch (err) {
      return next(err);
    }
  });
  router.get('/:id', async (req, res, next) => {
    try {
      const row = await findConditionById(pool, req.params.id);
      if (!row) return notFound(res, 'Condition', req.params.id);
      return res.type('application/fhir+json').json(renderCondition(row));
    } catch (err) {
      return next(err);
    }
  });
  return router;
}
