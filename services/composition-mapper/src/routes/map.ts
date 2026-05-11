// HTTP-route för composition-mapping (B25 4.10.5).
// POST /api/v1/map/medication-statement wrappar mapMedicationStatement-
// funktionen så att composition-mapper kan exponera sin core-funktionalitet
// över HTTP istället för bara via CLI (eval-runner).
//
// Demo-instans på CarliusFyra anropar detta från externa demos. Ingen auth —
// instansen är medvetet open access och kör bara mot syntetisk data
// (NIMLOTH_DATA_MODE=synthetic hard-låser via model-routers sensitivity-tier).

import { randomUUID } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import type { Logger } from 'pino';
import type { ModelRouter } from '@nimloth-core/model-router';
import { z } from 'zod';
import { MedicationStatementSchema } from '../validation/fhir.js';
import { mapMedicationStatement } from '../mapping/index.js';
import { LlmAssist } from '../mapping/llm-assist.js';
import type { CompositionMapperConfig } from '../config.js';
import type { CompositionMapperDb } from '../db.js';

/**
 * Request body — wrappar FHIR-resursen i en object så vi kan inkludera
 * inputId och options utan att utvidga FHIR-schemat.
 */
const RequestBodySchema = z.object({
  resource: MedicationStatementSchema,
  inputId: z.string().min(1).optional(),
  options: z
    .object({
      useLlm: z.boolean().optional(),
      threshold: z.number().min(0).max(1).optional(),
    })
    .optional(),
});

export interface MapRouteDeps {
  router: ModelRouter;
  config: CompositionMapperConfig;
  logger: Logger;
  /**
   * Optional — om satt skrivs audit-event till SQLite-outbox per request.
   * Saknas → ingen audit-emission (acceptabelt för demo/test).
   */
  db?: CompositionMapperDb;
}

export function createMapRouter(deps: MapRouteDeps): Router {
  const router = Router();

  // Instansiera LlmAssist EN gång vid mount — den är stateless förutom
  // prompt-loading. Återanvänds över alla requests för att undvika att
  // ladda prompts från disk per request.
  const llm = new LlmAssist({
    router: deps.router,
    logger: deps.logger,
    dataMode: deps.config.dataMode,
  });

  router.post('/medication-statement', async (req: Request, res: Response) => {
    const requestId = (req.headers['x-request-id'] as string) || randomUUID();
    const startedAt = Date.now();

    // Validate body
    const parsed = RequestBodySchema.safeParse(req.body);
    if (!parsed.success) {
      deps.logger.warn(
        { requestId, errors: parsed.error.errors },
        'map request validation failed',
      );
      return res.status(400).json({
        error: 'validation_error',
        message: 'Request body failed schema validation',
        details: parsed.error.errors,
      });
    }

    const { resource, inputId, options } = parsed.data;
    const finalInputId = inputId ?? randomUUID();

    deps.logger.info(
      {
        requestId,
        inputId: finalInputId,
        dataMode: deps.config.dataMode,
        useLlm: options?.useLlm ?? true,
      },
      'map request',
    );

    try {
      const result = await mapMedicationStatement(
        resource,
        finalInputId,
        {
          llm,
          ...(deps.db ? { audit: { db: deps.db } } : {}),
        },
        options ?? {},
      );

      const elapsedMs = Date.now() - startedAt;
      deps.logger.info(
        {
          requestId,
          inputId: finalInputId,
          status: result.status,
          aggregateConfidence: result.aggregateConfidence,
          elapsedMs,
        },
        'map request completed',
      );

      return res.status(200).json(result);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const elapsedMs = Date.now() - startedAt;
      deps.logger.error(
        {
          requestId,
          inputId: finalInputId,
          err: error.message,
          stack: error.stack,
          elapsedMs,
        },
        'map request failed',
      );
      return res.status(500).json({
        error: 'internal_error',
        message: error.message,
        requestId,
      });
    }
  });

  return router;
}
