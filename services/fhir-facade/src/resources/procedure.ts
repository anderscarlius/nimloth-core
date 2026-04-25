import type pg from 'pg';
import { Router } from 'express';
import type { FhirProcedure, FhirBundle } from '@nimloth-core/shared/types';
import { notFound } from './patient.js';

interface ProcedureRow {
  procedure_id: string;
  event_id: string;
  patient_pnr: string;
  code_system: string | null;
  code: string | null;
  display: string | null;
  kva_code: string | null;
  laterality: string | null;
  implant_type: string | null;
  implant_manufacturer: string | null;
  implant_model: string | null;
  implant_size: string | null;
  performer_hsa: string | null;
  procedure_date: Date | string | null;
  encounter_ref: string | null;
  created_at: Date | string;
}

function toIso(d: Date | string | null | undefined): string | undefined {
  if (!d) return undefined;
  return d instanceof Date ? d.toISOString() : String(d);
}

const LATERALITY_SNOMED: Record<string, { code: string; display: string }> = {
  LEFT: { code: '7771000', display: 'Left' },
  RIGHT: { code: '24028007', display: 'Right' },
  BILATERAL: { code: '51440002', display: 'Bilateral' },
};

export function renderProcedure(row: ProcedureRow): FhirProcedure {
  const implantExt = row.implant_type || row.implant_manufacturer
    ? [
        {
          url: 'https://core.nimloth.io/fhir/StructureDefinition/implant-details',
          extension: [
            { url: 'type', valueString: row.implant_type ?? '' },
            { url: 'manufacturer', valueString: row.implant_manufacturer ?? '' },
            { url: 'model', valueString: row.implant_model ?? '' },
            { url: 'size', valueString: row.implant_size ?? '' },
          ],
        },
      ]
    : undefined;

  const lat = row.laterality ? LATERALITY_SNOMED[row.laterality] : undefined;

  return {
    resourceType: 'Procedure',
    id: row.procedure_id,
    meta: { versionId: '1', lastUpdated: toIso(row.created_at)! },
    status: 'completed',
    code: row.code
      ? {
          coding: [
            { system: row.code_system ?? 'http://snomed.info/sct', code: row.code, display: row.display ?? undefined },
            row.kva_code
              ? {
                  system: 'http://klassifikationer.socialstyrelsen.se/kva',
                  code: row.kva_code,
                  display: row.display ?? undefined,
                }
              : undefined,
          ].filter(Boolean) as { system: string; code: string; display?: string }[],
          text: row.display ?? undefined,
        }
      : undefined,
    subject: { reference: `Patient/${row.patient_pnr}` },
    encounter: row.encounter_ref ? { reference: `Encounter/${row.encounter_ref}` } : undefined,
    performedDateTime: toIso(row.procedure_date),
    performer: row.performer_hsa
      ? [
          {
            actor: {
              reference: `Practitioner/${row.performer_hsa}`,
              display: row.performer_hsa,
            },
          },
        ]
      : undefined,
    bodySite: lat
      ? [
          {
            coding: [{ system: 'http://snomed.info/sct', code: lat.code, display: lat.display }],
          },
        ]
      : undefined,
    extension: implantExt,
  };
}

export async function findProceduresByPatient(pool: pg.Pool, pnr: string, limit = 100): Promise<ProcedureRow[]> {
  const r = await pool.query<ProcedureRow>(
    `SELECT * FROM fhir_procedures WHERE patient_pnr = $1 ORDER BY procedure_date DESC NULLS LAST LIMIT $2`,
    [pnr, limit],
  );
  return r.rows;
}

export async function findProcedureById(pool: pg.Pool, id: string): Promise<ProcedureRow | null> {
  const r = await pool.query<ProcedureRow>(`SELECT * FROM fhir_procedures WHERE procedure_id = $1`, [id]);
  return r.rows[0] ?? null;
}

export function procedureRouter(pool: pg.Pool): Router {
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
      const rows = await findProceduresByPatient(pool, patient);
      const bundle: FhirBundle = {
        resourceType: 'Bundle',
        type: 'searchset',
        total: rows.length,
        entry: rows.map((r) => ({ resource: renderProcedure(r), search: { mode: 'match' } })),
      };
      return res.type('application/fhir+json').json(bundle);
    } catch (err) {
      return next(err);
    }
  });
  router.get('/:id', async (req, res, next) => {
    try {
      const row = await findProcedureById(pool, req.params.id);
      if (!row) return notFound(res, 'Procedure', req.params.id);
      return res.type('application/fhir+json').json(renderProcedure(row));
    } catch (err) {
      return next(err);
    }
  });
  return router;
}
