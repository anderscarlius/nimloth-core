// PDL-middleware — kontrollerar vårdrelation + spärr.
// Stub-implementation: läser X-PDL-Care-Relation + X-PDL-Purpose headers.
// Kontrollerar blocked_patients-tabell för spärr.

import type { Request, Response, NextFunction } from 'express';
import type pg from 'pg';

export interface PdlContext {
  care_unit?: string;
  purpose: 'CARE' | 'EMERGENCY' | 'QUALITY_REGISTRY' | 'ADMINISTRATION';
  legal_basis: 'PDL_2_4' | 'PDL_4_1';
  has_care_relation: boolean;
  emergency_access: boolean;
}
// Module augmentation för Request.pdl finns i ../types.d.ts

/** Hämtar patient-pnr från req.params.id eller req.query.patient. */
function patientPnrFromRequest(req: Request): string | undefined {
  const idParam = (req.params as { id?: string }).id;
  if (idParam && /^\d{6,8}-?\d{4}$/.test(idParam)) return idParam;
  if (typeof req.query.patient === 'string') return req.query.patient;
  return undefined;
}

export function pdlMiddleware(pool: pg.Pool, opts: { enforce?: boolean } = {}) {
  const enforce = opts.enforce ?? false;
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const careRelation = req.header('x-pdl-care-relation') === 'true';
    const emergency = req.header('x-pdl-emergency-access') === 'true';
    const purposeHeader = (req.header('x-pdl-purpose') ?? 'CARE').toUpperCase();

    const purpose = ['CARE', 'EMERGENCY', 'QUALITY_REGISTRY', 'ADMINISTRATION'].includes(purposeHeader)
      ? (purposeHeader as PdlContext['purpose'])
      : 'CARE';

    req.pdl = {
      care_unit: req.header('x-pdl-care-unit'),
      purpose,
      legal_basis: emergency ? 'PDL_4_1' : 'PDL_2_4',
      has_care_relation: careRelation || emergency,
      emergency_access: emergency,
    };

    const pnr = patientPnrFromRequest(req);
    if (!pnr) return next();

    // Spärrkontroll
    try {
      const r = await pool.query<{ blocked_for: string[] }>(
        `SELECT blocked_for FROM blocked_patients WHERE personnummer = $1`,
        [pnr],
      );
      if (r.rows.length > 0 && !emergency) {
        const careUnit = req.pdl.care_unit;
        const blockedFor = r.rows[0].blocked_for ?? [];
        const blocked = blockedFor.length === 0 || (careUnit && blockedFor.includes(careUnit));
        if (blocked) {
          if (enforce) {
            res.status(403).type('application/fhir+json').json({
              resourceType: 'OperationOutcome',
              issue: [{ severity: 'error', code: 'forbidden', diagnostics: 'Patient spärrad (PDL) — nödöppning krävs' }],
            });
            return;
          }
        }
      }
    } catch (err) {
      // Ignorera DB-fel här — spärrkoll är best-effort i demo.
    }

    if (enforce && !req.pdl.has_care_relation) {
      res.status(403).type('application/fhir+json').json({
        resourceType: 'OperationOutcome',
        issue: [{ severity: 'error', code: 'forbidden', diagnostics: 'Ingen vårdrelation (X-PDL-Care-Relation saknas)' }],
      });
      return;
    }

    next();
  };
}
