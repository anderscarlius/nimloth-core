// PDL-middleware — kontrollerar vårdrelation + spärr + OPA på Patient-read (WP-IN3).
// Stub-implementation: läser X-PDL-* headers och blocked_patients-tabell.

import type { Request, Response, NextFunction } from 'express';
import type pg from 'pg';
import {
  evaluateFhirPatientRead,
  type PdlPurpose,
} from '@nimloth-core/pdl-policy';

export interface PdlContext {
  care_unit?: string;
  purpose: PdlPurpose;
  legal_basis: 'PDL_2_4' | 'PDL_4_1';
  has_care_relation: boolean;
  emergency_access: boolean;
  emergency_justification?: string;
  patient_blocked?: boolean;
  policy_decision?: 'PERMIT' | 'DENY';
  policy_reason?: string;
  /** Sätts vid 403 så audit-middleware kan klassificera utfallet. */
  audit_outcome_override?: string;
}
// Module augmentation för Request.pdl finns i ../types.d.ts

export interface PdlMiddlewareOptions {
  enforce?: boolean;
  /** OPA-policy på GET /fhir/r4/Patient/:id (kritisk path). */
  opaPatientRead?: boolean;
  fetchResearchConsent?: (personnummer: string) => Promise<boolean>;
}

const PNR_RE = /^\d{6,8}-?\d{4}$/;

/** Hämtar patient-pnr från path, req.params.id eller req.query.patient. */
function patientPnrFromRequest(req: Request): string | undefined {
  const idParam = (req.params as { id?: string }).id;
  if (idParam && PNR_RE.test(idParam)) return idParam;

  const pathOnly = (req.originalUrl ?? req.url).split('?')[0];
  const fromPatientPath = pathOnly.match(/\/Patient\/([^/$]+)/)?.[1];
  if (fromPatientPath && PNR_RE.test(fromPatientPath)) return fromPatientPath;

  if (typeof req.query.patient === 'string') return req.query.patient;
  return undefined;
}

function isPatientRead(req: Request): boolean {
  if (req.method !== 'GET') return false;
  const pathOnly = req.originalUrl.split('?')[0];
  const m = pathOnly.match(/\/fhir\/r4\/Patient\/([^/]+)$/);
  if (!m) return false;
  const id = m[1];
  return id !== undefined && !id.includes('$');
}

function forbidden(
  res: Response,
  diagnostics: string,
  req: Request,
  auditOutcome: string,
): void {
  if (req.pdl) req.pdl.audit_outcome_override = auditOutcome;
  res.status(403).type('application/fhir+json').json({
    resourceType: 'OperationOutcome',
    issue: [{ severity: 'error', code: 'forbidden', diagnostics }],
  });
}

export function pdlMiddleware(pool: pg.Pool, opts: PdlMiddlewareOptions = {}) {
  const enforce = opts.enforce ?? false;
  const opaPatientRead = opts.opaPatientRead ?? false;
  const fetchResearchConsent = opts.fetchResearchConsent;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const careRelation = req.header('x-pdl-care-relation') === 'true';
    const emergency = req.header('x-pdl-emergency-access') === 'true';
    const emergencyJustification = (req.header('x-pdl-emergency-justification') ?? '').trim();
    const purposeHeader = (req.header('x-pdl-purpose') ?? 'CARE').toUpperCase();

    const purpose = ['CARE', 'EMERGENCY', 'QUALITY_REGISTRY', 'ADMINISTRATION', 'RESEARCH'].includes(
      purposeHeader,
    )
      ? (purposeHeader as PdlContext['purpose'])
      : 'CARE';

    req.pdl = {
      care_unit: req.header('x-pdl-care-unit'),
      purpose,
      legal_basis: emergency ? 'PDL_4_1' : 'PDL_2_4',
      has_care_relation: careRelation || emergency,
      emergency_access: emergency,
      emergency_justification: emergencyJustification || undefined,
    };

    const pnr = patientPnrFromRequest(req);
    let patientBlocked = false;

    if (pnr) {
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
            patientBlocked = true;
            req.pdl.patient_blocked = true;
            if (enforce) {
              forbidden(
                res,
                'Patient spärrad (PDL) — nödöppning krävs',
                req,
                'DENIED_PATIENT_BLOCKED',
              );
              return;
            }
          }
        }
      } catch {
        // Ignorera DB-fel här — spärrkoll är best-effort i demo.
      }
    }

    if (enforce && !req.pdl.has_care_relation) {
      forbidden(
        res,
        'Ingen vårdrelation (X-PDL-Care-Relation saknas)',
        req,
        'DENIED_NO_CARE_RELATION',
      );
      return;
    }

    if (enforce && emergency && emergencyJustification.length === 0) {
      forbidden(
        res,
        'Nödöppning kräver X-PDL-Emergency-Justification',
        req,
        'DENIED_EMERGENCY_NO_JUSTIFICATION',
      );
      return;
    }

    if (opaPatientRead && isPatientRead(req) && pnr) {
      let researchConsent = false;
      if (req.pdl.purpose === 'RESEARCH' && fetchResearchConsent) {
        researchConsent = await fetchResearchConsent(pnr);
      }

      const policy = evaluateFhirPatientRead({
        has_care_relation: req.pdl.has_care_relation,
        emergency,
        emergency_justification: emergencyJustification,
        blocked: patientBlocked,
        purpose: req.pdl.purpose,
        research_consent: researchConsent,
      });

      req.pdl.policy_decision = policy.decision;
      req.pdl.policy_reason = policy.reason;

      if (enforce && !policy.allow) {
        const diag =
          policy.reason === 'RESEARCH_CONSENT_DENIED'
            ? 'Forskningssyfte utan samtycke (samtycke/spärr-stub)'
            : policy.reason === 'EMERGENCY_JUSTIFICATION_REQUIRED'
              ? 'Nödöppning kräver X-PDL-Emergency-Justification'
              : `PDL-policy nekar: ${policy.reason ?? 'DENY'}`;
        forbidden(res, diag, req, `DENIED_${policy.reason ?? 'POLICY'}`);
        return;
      }
    }

    next();
  };
}
