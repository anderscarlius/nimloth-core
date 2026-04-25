// Minimal CDS Hooks-server (HL7 CDS Hooks 1.1) som kör regler mot lokal FHIR-cache.
// Tre regler speglar services/cds-hooks: anticoagulation, implant-alert, dvt-risk.

import express, { type Express, type Request, type Response } from 'express';
import type { Logger } from 'pino';
import type { FhirCache } from './fhir-cache.js';
import type { EdgeConfig } from './config.js';

export interface CdsServerDeps {
  config: EdgeConfig;
  cache: FhirCache;
  logger: Logger;
}

interface HookRequest {
  hookInstance?: string;
  hook?: string;
  context?: {
    userId?: string;
    patientId?: string;
  };
}

interface Card {
  indicator: 'info' | 'warning' | 'critical';
  summary: string;
  detail?: string;
  source: { label: string };
  suggestions?: Array<{ label: string }>;
}

const ANTICOAGULANT_ATC_PREFIXES = ['B01AA', 'B01AE', 'B01AF'];

function stripRef(ref: string | undefined | null): string | null {
  if (!ref) return null;
  return ref.startsWith('Patient/') ? ref.slice('Patient/'.length) : ref;
}

function evaluateAnticoagulation(cache: FhirCache, patientPnr: string): Card[] {
  const data = cache.queryPatientEverything(patientPnr);
  const match = data.medications.find((m) =>
    (m.atc_code ?? '').match(
      new RegExp(`^(${ANTICOAGULANT_ATC_PREFIXES.join('|')})`),
    ),
  );
  if (!match) return [];
  return [
    {
      indicator: 'critical',
      summary: 'Antikoagulerad patient — kontrollera INR före ingrepp',
      detail: `Patienten står på ${match.drug_name ?? 'antikoagulantia'} (ATC ${match.atc_code ?? 'okänd'}). Kontrollera aktuellt INR före ingrepp.`,
      source: { label: 'VGR CDS (edge) · Waran-profylax' },
      suggestions: [{ label: 'Beställ akut INR' }, { label: 'Visa INR-trend' }],
    },
  ];
}

function evaluateImplantAlert(cache: FhirCache, patientPnr: string): Card[] {
  const data = cache.queryPatientEverything(patientPnr);
  const implants = data.procedures.filter(
    (p) => p.implant_manufacturer || p.implant_model,
  );
  return implants.slice(0, 3).map((p) => ({
    indicator: 'info' as const,
    summary: `${p.display ?? 'Implantat'} — ${p.implant_manufacturer ?? ''} ${p.implant_model ?? ''}`.trim(),
    detail: `Inopererad ${p.procedure_date ?? 'okänt datum'}. Storlek: ${p.implant_size ?? '—'}.`,
    source: { label: 'VGR CDS (edge) · Implantatregister' },
  }));
}

function evaluateDvtRisk(cache: FhirCache, patientPnr: string): Card[] {
  const data = cache.queryPatientEverything(patientPnr);
  const dvt = data.conditions.find((c) => (c.icd_code ?? '').startsWith('I82'));
  if (!dvt) return [];
  return [
    {
      indicator: 'warning',
      summary: `Tidigare DVT ${dvt.onset_at?.slice(0, 10) ?? ''} — utökad profylax rekommenderad`,
      detail:
        'Postoperativ DVT. Förlängd trombosprofylax rekommenderas i minst 35 dagar postoperativt enligt VGR-riktlinje.',
      source: { label: 'VGR CDS (edge) · Trombosprofylax' },
    },
  ];
}

type Rule = {
  id: string;
  hook: string;
  title: string;
  description: string;
  evaluate: (cache: FhirCache, pnr: string) => Card[];
};

const RULES: Rule[] = [
  {
    id: 'core-anticoagulation',
    hook: 'patient-view',
    title: 'Antikoagulation',
    description: 'Varnar för patienter som står på antikoagulantia (Waran m.fl.).',
    evaluate: evaluateAnticoagulation,
  },
  {
    id: 'core-implant-alert',
    hook: 'patient-view',
    title: 'Implantat',
    description: 'Visar implantatinformation vid patientvy.',
    evaluate: evaluateImplantAlert,
  },
  {
    id: 'core-dvt-risk',
    hook: 'patient-view',
    title: 'DVT-risk',
    description: 'Varnar vid tidigare djup ventrombos.',
    evaluate: evaluateDvtRisk,
  },
];

export function createCdsServer(deps: CdsServerDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'edge-cds',
      instance_id: deps.config.instanceId,
      services: RULES.length,
    });
  });

  app.get('/cds-services', (_req, res) => {
    res.json({
      services: RULES.map((r) => ({
        hook: r.hook,
        title: r.title,
        description: r.description,
        id: r.id,
      })),
    });
  });

  app.post('/cds-services/:id', (req: Request, res: Response): void => {
    const rule = RULES.find((r) => r.id === req.params.id);
    if (!rule) {
      res.status(404).json({ error: 'unknown service' });
      return;
    }

    const body = req.body as HookRequest;
    const pnr = stripRef(body.context?.patientId);
    if (!pnr) {
      res.json({ cards: [] });
      return;
    }

    try {
      const cards = rule.evaluate(deps.cache, pnr);
      res.json({ cards });
    } catch (err) {
      deps.logger.error({ err, rule: rule.id, pnr }, 'cds rule evaluation failed');
      res.status(500).json({ cards: [] });
    }
  });

  return app;
}
