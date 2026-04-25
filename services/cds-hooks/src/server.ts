// CDS Hooks 2.0-server.

import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import type { Logger } from 'pino';
import type { FhirClient } from './fhir-client.js';
import {
  type CardsResponse,
  type HookRequest,
  type Prefetch,
  extractId,
  sortCards,
} from './types.js';
import {
  anticoagulationCard,
  implantCards,
  dvtCard,
  runAllRules,
} from './rules/index.js';

export interface ServerDeps {
  fhirClient: FhirClient;
  logger: Logger;
}

interface ServiceDefinition {
  id: string;
  hook: string;
  title: string;
  description: string;
  prefetch?: Record<string, string>;
  run: (prefetch: Prefetch) => ReturnType<typeof runAllRules>;
}

const DEFAULT_PREFETCH: Record<string, string> = {
  patient: 'Patient/{{context.patientId}}',
  medications: 'MedicationStatement?patient={{context.patientId}}&status=active',
  procedures: 'Procedure?patient={{context.patientId}}',
  conditions: 'Condition?patient={{context.patientId}}',
};

const SERVICES: ServiceDefinition[] = [
  {
    id: 'core-anticoagulation-check',
    hook: 'patient-view',
    title: 'Nimloth Core — Antikoagulationsvarning',
    description: 'Varning vid aktiv antikoagulantia (ATC B01A).',
    prefetch: DEFAULT_PREFETCH,
    run: (p) => {
      const c = anticoagulationCard(p);
      return c ? [c] : [];
    },
  },
  {
    id: 'core-implant-alert',
    hook: 'patient-view',
    title: 'Nimloth Core — Implantatvarning',
    description: 'Informerar om implantat (protes m.m.) vid patientöppning.',
    prefetch: DEFAULT_PREFETCH,
    run: (p) => implantCards(p),
  },
  {
    id: 'core-dvt-risk',
    hook: 'patient-view',
    title: 'Nimloth Core — Trombosrisk',
    description: 'Informerar om tidigare venös tromboembolism (ICD-10 I80–I82).',
    prefetch: DEFAULT_PREFETCH,
    run: (p) => {
      const c = dvtCard(p);
      return c ? [c] : [];
    },
  },
];

/** Kombinerad service — kör alla regler. Exponeras som alias `core-patient-alerts`. */
const COMBINED_SERVICE: ServiceDefinition = {
  id: 'core-patient-alerts',
  hook: 'patient-view',
  title: 'Nimloth Core — Patientvarningar (samlad)',
  description: 'Kör alla Nimloth Core CDS-regler och returnerar en kombinerad lista med varningar.',
  prefetch: DEFAULT_PREFETCH,
  run: (p) => runAllRules(p),
};

async function resolvePrefetch(
  body: HookRequest,
  fhirClient: FhirClient,
  logger: Logger,
): Promise<Prefetch> {
  // Om prefetch finns i request, använd den direkt.
  const supplied = body.prefetch as Prefetch | undefined;
  const hasAny =
    supplied &&
    (supplied.patient || supplied.medications || supplied.procedures || supplied.conditions);
  if (hasAny) return supplied;

  // Annars: hämta från FHIR Facade baserat på context.patientId.
  const patientId = extractId(body.context?.patientId);
  if (!patientId) return {};
  try {
    return await fhirClient.fetchAllForPatient(patientId);
  } catch (err) {
    logger.warn({ err, patientId }, 'Could not fetch prefetch from FHIR');
    return {};
  }
}

export function createServer(deps: ServerDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '5mb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'cds-hooks', services: SERVICES.map((s) => s.id) });
  });

  // Discovery
  app.get('/cds-services', (_req, res) => {
    res.json({ services: SERVICES.map(({ id, hook, title, description, prefetch }) => ({ id, hook, title, description, prefetch })) });
  });

  // Hook-endpoints för varje service + combined alias
  const handler = (svc: ServiceDefinition) => async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as HookRequest;
      if (!body?.context?.patientId) {
        return res.status(400).json({
          error: 'invalid_request',
          message: 'context.patientId required',
        });
      }
      const prefetch = await resolvePrefetch(body, deps.fhirClient, deps.logger);
      const cards = sortCards(svc.run(prefetch));
      deps.logger.info(
        { service: svc.id, patientId: body.context.patientId, cards: cards.length },
        'CDS hook processed',
      );
      const response: CardsResponse = { cards };
      return res.json(response);
    } catch (err) {
      return next(err);
    }
  };

  for (const svc of SERVICES) {
    app.post(`/cds-services/${svc.id}`, handler(svc));
  }
  app.post(`/cds-services/${COMBINED_SERVICE.id}`, handler(COMBINED_SERVICE));

  // Error-handler
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    deps.logger.error({ err }, 'request failed');
    const msg = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: 'internal', message: msg });
  });

  return app;
}

export { SERVICES, COMBINED_SERVICE };
