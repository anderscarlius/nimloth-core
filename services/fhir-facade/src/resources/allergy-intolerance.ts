import type pg from 'pg';
import { Router } from 'express';
import type { FhirAllergyIntolerance, FhirBundle } from '@nimloth-core/shared/types';
import { notFound } from './patient.js';

interface AllergyRow {
  allergy_id: string;
  event_id: string;
  patient_pnr: string;
  allergen: string | null;
  code_system: string | null;
  code: string | null;
  reaction: string | null;
  severity: string | null;
  verified: boolean | null;
  reported_at: Date | string | null;
  created_at: Date | string;
}

function toIso(d: Date | string | null | undefined): string | undefined {
  if (!d) return undefined;
  return d instanceof Date ? d.toISOString() : String(d);
}

const SEVERITY_MAP: Record<string, 'mild' | 'moderate' | 'severe'> = {
  MILD: 'mild',
  MODERATE: 'moderate',
  SEVERE: 'severe',
};

export function renderAllergyIntolerance(row: AllergyRow): FhirAllergyIntolerance {
  return {
    resourceType: 'AllergyIntolerance',
    id: row.allergy_id,
    meta: { versionId: '1', lastUpdated: toIso(row.created_at)! },
    clinicalStatus: {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical',
          code: 'active',
        },
      ],
    },
    verificationStatus: {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-verification',
          code: row.verified ? 'confirmed' : 'unconfirmed',
        },
      ],
    },
    type: 'allergy',
    category: ['medication'],
    criticality: row.severity === 'SEVERE' ? 'high' : 'low',
    code: row.code
      ? {
          coding: [
            {
              system: row.code_system ?? 'http://snomed.info/sct',
              code: row.code,
              display: row.allergen ?? undefined,
            },
          ],
          text: row.allergen ?? undefined,
        }
      : row.allergen
        ? { text: row.allergen }
        : undefined,
    patient: { reference: `Patient/${row.patient_pnr}` },
    recordedDate: toIso(row.reported_at),
    reaction: row.reaction
      ? [
          {
            manifestation: [{ text: row.reaction }],
            severity: SEVERITY_MAP[row.severity ?? 'MODERATE'] ?? 'moderate',
          },
        ]
      : undefined,
  };
}

export async function findAllergiesByPatient(pool: pg.Pool, pnr: string, limit = 50): Promise<AllergyRow[]> {
  const r = await pool.query<AllergyRow>(
    `SELECT * FROM fhir_allergy_intolerances WHERE patient_pnr = $1 ORDER BY reported_at DESC NULLS LAST LIMIT $2`,
    [pnr, limit],
  );
  return r.rows;
}

export async function findAllergyById(pool: pg.Pool, id: string): Promise<AllergyRow | null> {
  const r = await pool.query<AllergyRow>(`SELECT * FROM fhir_allergy_intolerances WHERE allergy_id = $1`, [id]);
  return r.rows[0] ?? null;
}

export function allergyIntoleranceRouter(pool: pg.Pool): Router {
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
      const rows = await findAllergiesByPatient(pool, patient);
      const bundle: FhirBundle = {
        resourceType: 'Bundle',
        type: 'searchset',
        total: rows.length,
        entry: rows.map((r) => ({ resource: renderAllergyIntolerance(r), search: { mode: 'match' } })),
      };
      return res.type('application/fhir+json').json(bundle);
    } catch (err) {
      return next(err);
    }
  });
  router.get('/:id', async (req, res, next) => {
    try {
      const row = await findAllergyById(pool, req.params.id);
      if (!row) return notFound(res, 'AllergyIntolerance', req.params.id);
      return res.type('application/fhir+json').json(renderAllergyIntolerance(row));
    } catch (err) {
      return next(err);
    }
  });
  return router;
}
