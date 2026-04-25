import type pg from 'pg';
import { Router } from 'express';
import type { FhirObservation, FhirBundle, FhirCodeableConcept, FhirQuantity } from '@nimloth-core/shared/types';
import { notFound } from './patient.js';

export interface ObservationRow {
  observation_id: string;
  event_id: string;
  patient_pnr: string;
  category: string | null;
  code_system: string | null;
  code: string | null;
  display: string | null;
  value_numeric: number | string | null;
  value_text: string | null;
  unit: string | null;
  effective_at: Date | string | null;
  encounter_ref: string | null;
  source_system: string | null;
  event_data: unknown;
  created_at: Date | string;
}

export function renderObservation(row: ObservationRow): FhirObservation {
  const code: FhirCodeableConcept = {
    coding: [{ system: row.code_system ?? undefined, code: row.code ?? '', display: row.display ?? undefined }],
    text: row.display ?? undefined,
  };

  const cat: FhirCodeableConcept = {
    coding: [
      {
        system: 'http://terminology.hl7.org/CodeSystem/observation-category',
        code: row.category ?? 'exam',
        display: row.category === 'vital-signs' ? 'Vital Signs' : 'Laboratory',
      },
    ],
  };

  const effective = row.effective_at instanceof Date ? row.effective_at.toISOString() : row.effective_at ?? undefined;

  // För BT: hämta komponenter från event_data.payload.values
  const eventData = row.event_data as { payload?: { values?: Array<{ code?: string; display?: string; value?: number; unit?: string; system?: string }> } } | undefined;
  const valuesArr = eventData?.payload?.values ?? [];
  const isBp = row.category === 'vital-signs' && valuesArr.length >= 2;

  const resource: FhirObservation = {
    resourceType: 'Observation',
    id: row.observation_id,
    meta: { versionId: '1', lastUpdated: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at) },
    status: 'final',
    category: [cat],
    code,
    subject: { reference: `Patient/${row.patient_pnr}` },
    effectiveDateTime: effective ?? undefined,
    encounter: row.encounter_ref ? { reference: `Encounter/${row.encounter_ref}` } : undefined,
  };

  if (isBp) {
    resource.component = valuesArr.map((v) => ({
      code: {
        coding: [{ system: v.system ?? 'http://snomed.info/sct', code: v.code ?? '', display: v.display ?? '' }],
      },
      valueQuantity: toQuantity(v.value, v.unit ?? row.unit ?? ''),
    }));
  } else if (row.value_numeric != null) {
    resource.valueQuantity = toQuantity(row.value_numeric, row.unit ?? '');
  } else if (row.value_text) {
    resource.valueString = row.value_text;
  }

  return resource;
}

function toQuantity(value: number | string | null | undefined, unit: string): FhirQuantity {
  const n = value == null ? undefined : typeof value === 'number' ? value : Number(value);
  return {
    value: Number.isFinite(n) ? n : undefined,
    unit,
    system: 'http://unitsofmeasure.org',
    code: unit,
  };
}

export async function findObservationsByPatient(
  pool: pg.Pool,
  pnr: string,
  category?: string,
  code?: string,
  limit = 200,
): Promise<ObservationRow[]> {
  const r = await pool.query<ObservationRow>(
    `SELECT * FROM fhir_observations
     WHERE patient_pnr = $1
       AND ($2::text IS NULL OR category = $2)
       AND ($3::text IS NULL OR code = $3)
     ORDER BY effective_at DESC NULLS LAST LIMIT $4`,
    [pnr, category ?? null, code ?? null, limit],
  );
  return r.rows;
}

export async function findObservationById(pool: pg.Pool, id: string): Promise<ObservationRow | null> {
  const r = await pool.query<ObservationRow>(`SELECT * FROM fhir_observations WHERE observation_id = $1`, [id]);
  return r.rows[0] ?? null;
}

export function observationRouter(pool: pg.Pool): Router {
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
      const category = normalizeCategory(typeof req.query.category === 'string' ? req.query.category : undefined);
      const code = typeof req.query.code === 'string' ? req.query.code : undefined;
      const count = req.query._count ? Number(req.query._count) : undefined;
      const rows = await findObservationsByPatient(pool, patient, category, code, count);
      const bundle: FhirBundle = {
        resourceType: 'Bundle',
        type: 'searchset',
        total: rows.length,
        entry: rows.map((r) => ({ resource: renderObservation(r), search: { mode: 'match' } })),
      };
      return res.type('application/fhir+json').json(bundle);
    } catch (err) {
      return next(err);
    }
  });
  router.get('/:id', async (req, res, next) => {
    try {
      const row = await findObservationById(pool, req.params.id);
      if (!row) return notFound(res, 'Observation', req.params.id);
      return res.type('application/fhir+json').json(renderObservation(row));
    } catch (err) {
      return next(err);
    }
  });
  return router;
}

function normalizeCategory(c: string | undefined): string | undefined {
  if (!c) return undefined;
  if (c === 'vital-signs' || c === 'laboratory') return c;
  if (c === 'LAB') return 'laboratory';
  return c;
}
