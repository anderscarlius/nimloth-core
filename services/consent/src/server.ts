import express, { type Express, type Request, type Response } from 'express';
import {
  evaluateFhirPatientRead,
  type FhirPatientReadPolicyInput,
  type PdlPurpose,
} from '@nimloth-core/pdl-policy';
import type { RegistryIndex } from './registry.js';
import { hasResearchConsent, isBlocked } from './registry.js';

export interface ConsentServerDeps {
  index: RegistryIndex;
}

export interface DecideBody {
  patient?: { pnr?: string };
  careUnit?: string;
  purpose?: PdlPurpose;
  has_care_relation?: boolean;
  emergency?: boolean;
  emergency_justification?: string;
}

export function createServer(deps: ConsentServerDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'consent',
      synthetic: true,
      data_class: 0,
      blocks: deps.index.blocksByPnr.size,
      consents: deps.index.consentsByPnrPurpose.size,
    });
  });

  app.get('/blocks/:personnummer', (req: Request, res: Response) => {
    const rec = deps.index.blocksByPnr.get(req.params.personnummer);
    if (!rec) {
      res.json({ personnummer: req.params.personnummer, blocked: false });
      return;
    }
    res.json({
      personnummer: rec.personnummer,
      blocked: true,
      blocked_for: rec.blocked_for,
      reason: rec.reason,
    });
  });

  app.get('/consent/:personnummer', (req: Request, res: Response) => {
    const purpose = (typeof req.query.purpose === 'string' ? req.query.purpose : 'RESEARCH').toUpperCase();
    const granted =
      purpose === 'RESEARCH'
        ? hasResearchConsent(deps.index, req.params.personnummer)
        : true;
    res.json({
      personnummer: req.params.personnummer,
      purpose,
      granted,
      synthetic: true,
    });
  });

  app.post('/decide', (req: Request, res: Response) => {
    const body = req.body as DecideBody;
    const pnr = body.patient?.pnr ?? '';
    const purpose = (body.purpose ?? 'CARE').toUpperCase() as PdlPurpose;
    const careUnit = body.careUnit;
    const emergency = body.emergency === true;
    const hasCare = body.has_care_relation === true || emergency;
    const blocked = pnr ? isBlocked(deps.index, pnr, careUnit) : false;
    const researchConsent = pnr ? hasResearchConsent(deps.index, pnr) : false;

    const input: FhirPatientReadPolicyInput = {
      has_care_relation: hasCare,
      emergency,
      emergency_justification: body.emergency_justification ?? '',
      blocked,
      purpose,
      research_consent: researchConsent,
    };

    const result = evaluateFhirPatientRead(input);
    res.json({
      decision: result.decision,
      allow: result.allow,
      reason: result.reason,
      input: { personnummer: pnr, ...input },
      policy: 'nimloth.fhir_patient_read',
      synthetic: true,
    });
  });

  return app;
}
