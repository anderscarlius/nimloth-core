// FHIR Facade — Express-app + route-wiring.

import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import type pg from 'pg';
import type { Producer } from 'kafkajs';
import type { Logger } from 'pino';

import { patientRouter } from './resources/patient.js';
import { observationRouter } from './resources/observation.js';
import { medicationStatementRouter } from './resources/medication-statement.js';
import { conditionRouter } from './resources/condition.js';
import { procedureRouter } from './resources/procedure.js';
import { allergyIntoleranceRouter } from './resources/allergy-intolerance.js';
import { encounterRouter } from './resources/encounter.js';
import { diagnosticReportRouter } from './resources/diagnostic-report.js';
import { carePlanRouter } from './resources/care-plan.js';
import { patientEverything } from './operations/everything.js';
import { notFound } from './resources/patient.js';
import { createAuthMiddleware, type AuthMiddlewareDeps } from './middleware/auth.js';
import { loadAuthConfig, type AuthConfig } from './auth/config.js';
import { pdlMiddleware, type PdlMiddlewareOptions } from './middleware/pdl.js';
import { auditMiddleware } from './middleware/audit.js';
import { createSyncRouter } from './sync.js';
import type { StoreRouter } from './stores/index.js';
import type { ParityRunner } from './parity/runner.js';
import { selectLatest, selectHistory } from './parity/queries.js';
import { renderSnapshots } from './parity/markdown.js';
import type { ParityTrigger } from './parity/types.js';
import { loadSmartConfig } from './smart/config.js';
import { createSmartRouter } from './smart/router.js';

export interface MaterializerMetricsView {
  processed: number;
  errors: number;
  byType: Record<string, number>;
}

export interface ServerDeps {
  pool: pg.Pool;
  auditProducer: Producer;
  logger: Logger;
  instanceId: string;
  mode: 'primary' | 'replica';
  /** Sprint 2 P3.3: store-router (postgres / openehr / both). */
  storeRouter: StoreRouter;
  /** Sprint 2 P3.4: paritets-runner. Optional — null när mode != 'both'
   *  eftersom asymmetrisk paritet är meningslös. När null returnerar
   *  /facade/parity/*-endpoints 503. */
  parityRunner?: ParityRunner | null;
  /** PDL-enforce-flag — default false (loggar bara), true returnerar 403 vid
   *  saknad vårdrelation eller spärr. Används av PDL-bevarande-tester. */
  pdlEnforce?: boolean;
  /** WP-IN3: OPA på Patient-read + valfri samtyckes-lookup. */
  pdlMiddlewareOptions?: Partial<PdlMiddlewareOptions>;
  /** AUTH_MODE + Keycloak/HSA — default från env via loadAuthConfig(). */
  authConfig?: AuthConfig;
  /** Test-injektion för JWT/HSA (auth-matris i CI). */
  authMiddlewareDeps?: Partial<AuthMiddlewareDeps>;
  /** Callback som returnerar en ren snapshot av materializer-stats. */
  getMaterializerMetrics: () => MaterializerMetricsView;
  /** Test/dev: override publik bas-URL för SMART well-known (annars env). */
  smartPublicBaseUrl?: string;
}

export function createServer(deps: ServerDeps): Express {
  const app = express();
  app.disable('x-powered-by');

  // Generic middleware
  app.use((req, _res, next) => {
    deps.logger.debug({ method: req.method, url: req.url }, 'incoming');
    next();
  });

  // Health + metrics (utanför FHIR-prefix, ingen auth/pdl)
  app.get('/health', async (_req, res) => {
    let dbOk = false;
    try {
      await deps.pool.query('SELECT 1');
      dbOk = true;
    } catch {
      dbOk = false;
    }
    res.json({
      status: dbOk ? 'ok' : 'degraded',
      service: 'fhir-facade',
      instance_id: deps.instanceId,
      fhir_mode: deps.mode,
      db_connected: dbOk,
      materializer: deps.getMaterializerMetrics(),
    });
  });

  app.get('/metrics', (_req, res) => {
    const m = deps.getMaterializerMetrics();
    const lines = [
      `# HELP core_fhir_materialized_total Antal events materialiserade`,
      `# TYPE core_fhir_materialized_total counter`,
      `core_fhir_materialized_total{instance="${deps.instanceId}"} ${m.processed}`,
      `# HELP core_fhir_materialize_errors_total Fel under materialisering`,
      `# TYPE core_fhir_materialize_errors_total counter`,
      `core_fhir_materialize_errors_total{instance="${deps.instanceId}"} ${m.errors}`,
    ];
    for (const [type, cnt] of Object.entries(m.byType)) {
      lines.push(`core_fhir_materialized_by_type{instance="${deps.instanceId}",topic="${type}"} ${cnt}`);
    }
    res.type('text/plain; version=0.0.4').send(lines.join('\n') + '\n');
  });

  // FHIR-endpoints med auth/audit/pdl.
  //
  // Notera ordningen: audit registreras FÖRE pdl. Annars hinner audit-
  // listenern (`res.on('finish')`) inte registreras innan pdl-middleware
  // skickar 403 vid saknad vårdrelation eller spärr — och audit-spåret
  // blir blint för nekade access-försök. PDL-lag kräver att försök loggas,
  // inte bara lyckade läsningar. Audit läser req.pdl + req.user vid
  // finish-tid, så datat finns där oavsett middleware-ordning.
  const fhir = express.Router();
  const authConfig = deps.authConfig ?? loadAuthConfig();
  const smartConfig = loadSmartConfig(authConfig.mode);
  if (deps.smartPublicBaseUrl) {
    smartConfig.publicBaseUrl = deps.smartPublicBaseUrl.replace(/\/$/, '');
  }
  const authDeps: AuthMiddlewareDeps = {
    config: authConfig,
    ...deps.authMiddlewareDeps,
  };
  fhir.use(createAuthMiddleware(authDeps, { required: false }));
  fhir.use(auditMiddleware({ producer: deps.auditProducer, logger: deps.logger }));
  fhir.use(
    pdlMiddleware(deps.pool, {
      enforce: deps.pdlEnforce ?? false,
      ...deps.pdlMiddlewareOptions,
    }),
  );

  // Patient + $everything — registreras som direkt GET-route före /Patient-routern
  // (Express `use` med '$' i path matchar inte pålitligt; direkt .get fungerar).
  fhir.get('/Patient/:id/\\$everything', async (req, res, next) => {
    try {
      const bundle = await patientEverything(deps.pool, req.params.id);
      if (!bundle) return notFound(res, 'Patient', req.params.id);
      return res.type('application/fhir+json').json(bundle);
    } catch (err) {
      return next(err);
    }
  });
  const resourceDeps = { pool: deps.pool, storeRouter: deps.storeRouter };
  fhir.use('/Patient', patientRouter(resourceDeps));

  // Övriga resurser — de fem core-resurserna går via store-router (postgres
  // eller openehr beroende på CANONICAL_STORE). Övriga är kvar på postgres
  // tills openEHR-spåret täcker dem (Sprint 3+).
  fhir.use('/Observation', observationRouter(resourceDeps));
  fhir.use('/MedicationStatement', medicationStatementRouter(resourceDeps));
  fhir.use('/Condition', conditionRouter(resourceDeps));
  fhir.use('/Procedure', procedureRouter(resourceDeps));
  fhir.use('/AllergyIntolerance', allergyIntoleranceRouter(deps.pool));
  fhir.use('/Encounter', encounterRouter(deps.pool));
  fhir.use('/DiagnosticReport', diagnosticReportRouter(deps.pool));
  fhir.use('/CarePlan', carePlanRouter(deps.pool));

  // Metadata (CapabilityStatement — minimal)
  fhir.get('/metadata', (_req, res) => {
    const smartSecurity =
      smartConfig.enabled
        ? {
            extension: [
              {
                url: 'http://fhir-registry.smarthealthit.org/StructureDefinition/oauth-uris',
                extension: [
                  { url: 'authorize', valueUri: `${smartConfig.publicBaseUrl}/smart/authorize` },
                  { url: 'token', valueUri: `${smartConfig.publicBaseUrl}/smart/token` },
                ],
              },
            ],
          }
        : undefined;
    res.type('application/fhir+json').json({
      resourceType: 'CapabilityStatement',
      status: 'active',
      date: new Date().toISOString(),
      kind: 'instance',
      software: { name: 'Nimloth Core FHIR Facade', version: '0.1.0' },
      fhirVersion: '4.0.1',
      format: ['application/fhir+json', 'json'],
      rest: [
        {
          mode: 'server',
          security: smartSecurity,
          resource: [
            'Patient',
            'Observation',
            'MedicationStatement',
            'Condition',
            'Procedure',
            'AllergyIntolerance',
            'Encounter',
            'DiagnosticReport',
            'CarePlan',
          ].map((t) => ({ type: t, interaction: [{ code: 'read' }, { code: 'search-type' }] })),
        },
      ],
    });
  });

  app.use('/fhir/r4', fhir);

  if (smartConfig.enabled) {
    app.use(createSmartRouter(smartConfig));
  }

  // Sprint 2 P3.3: openEHR-coverage rapport. Listar fält som ofta returnerade
  // null/undefined från AQL-mappningen — diagnostisk för P3.0b XML-OPT-arbetet.
  // Inte FHIR-resurs, ingen PDL-kontroll. Skydd via netverkspolicy i prod.
  app.get('/facade/coverage', (_req, res) => {
    res.json({
      mode: deps.storeRouter.mode,
      total_missing: deps.storeRouter.coverage.totalMissing(),
      gaps: deps.storeRouter.coverage.getCoverageReport(),
    });
  });
  app.post('/facade/coverage/reset', (_req, res) => {
    deps.storeRouter.coverage.reset();
    res.json({ status: 'reset' });
  });

  // Sprint 2 P3.4: paritetsdiff-endpoints. System-internal, monteras
  // direkt på app utanför auth/audit/pdl-mw-kedjan (samma pattern som
  // /facade/coverage och /sync). ParityRunner publicerar PARITY_RUN-
  // audit-event manuellt via auditProducer i emitParityAudit.
  app.post('/facade/parity/run', express.json(), async (req, res, next) => {
    if (!deps.parityRunner) {
      return res.status(503).json({
        error: 'parity_runner_unavailable',
        detail: `CANONICAL_STORE måste vara 'both' (är: ${deps.storeRouter.mode})`,
      });
    }
    const patient =
      typeof req.query.patient === 'string'
        ? req.query.patient
        : typeof (req.body as { patient?: unknown })?.patient === 'string'
          ? ((req.body as { patient: string }).patient)
          : undefined;
    if (!patient) {
      return res.status(400).json({ error: 'patient_required', detail: 'patient query-param eller body.patient krävs' });
    }
    const triggerInput = (req.body as { trigger?: unknown })?.trigger;
    const trigger: ParityTrigger =
      triggerInput === 'test' ? 'test' : triggerInput === 'scheduled' ? 'scheduled' : 'manual';
    try {
      const run = await deps.parityRunner.runForPatient(patient, trigger);
      return res.json({
        run_id: run.run_id,
        taken_at: run.taken_at.toISOString(),
        trigger: run.trigger,
        patient_pnr: run.patient_pnr,
        snapshots: run.snapshots,
        failures: run.failures,
      });
    } catch (err) {
      return next(err);
    }
  });

  app.get('/facade/parity/latest', async (req, res, next) => {
    try {
      const patient = typeof req.query.patient === 'string' ? req.query.patient : undefined;
      const format = req.query.format === 'markdown' ? 'markdown' : 'json';
      const snapshots = await selectLatest(deps.pool, patient);
      if (format === 'markdown') {
        return res.type('text/markdown; charset=utf-8').send(renderSnapshots(snapshots));
      }
      return res.json({ snapshots });
    } catch (err) {
      return next(err);
    }
  });

  app.get('/facade/parity/history', async (req, res, next) => {
    try {
      const patient = typeof req.query.patient === 'string' ? req.query.patient : undefined;
      const limit = Math.min(Number(req.query.limit ?? 20) || 20, 500);
      const format = req.query.format === 'markdown' ? 'markdown' : 'json';
      const snapshots = await selectHistory(deps.pool, limit, patient);
      if (format === 'markdown') {
        return res.type('text/markdown; charset=utf-8').send(renderSnapshots(snapshots));
      }
      return res.json({ snapshots, limit });
    } catch (err) {
      return next(err);
    }
  });

  // Care-unit-edge sync-API (Sprint 1, P2). Inte under /fhir/r4 — det är
  // systemkommunikation mellan central och edge, inte klinisk access.
  app.use('/sync', createSyncRouter({ pool: deps.pool, kafkaProducer: deps.auditProducer, logger: deps.logger }));

  // Error-handler
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    deps.logger.error({ err }, 'request failed');
    const msg = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).type('application/fhir+json').json({
      resourceType: 'OperationOutcome',
      issue: [{ severity: 'error', code: 'exception', diagnostics: msg }],
    });
  });

  return app;
}
