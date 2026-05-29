import express, { type Request, type Response } from "express";
import type { Logger } from "pino";
import { AqlClient } from "./aql-client.js";
import { runReview, type StreamEvent, type RunReviewOptions } from "./orchestrator.js";

export interface ServerDeps {
  aqlClient: AqlClient;
  logger: Logger;
}

/** Tolka ?debug_inject=force_unsourced. ALDRIG default-på — endast explicit
 *  per-anrop. Loggar tydligt så ingen tror att en avvisning var äkta drift. */
function parseDebugInject(req: Request, logger: Logger): RunReviewOptions {
  const raw = req.query.debug_inject;
  if (raw === "force_unsourced") {
    logger.warn(
      { patientId: req.params.patientId, debug_inject: raw },
      "DEBUG-INJECT AKTIV (force_unsourced) — syntesen bypassas med känd osourcerad text för demo av S1-avvisning. INTE äkta drift.",
    );
    return { debugInject: "force_unsourced" };
  }
  return {};
}

export function createServer(deps: ServerDeps): express.Express {
  const app = express();
  app.use(express.json({ limit: "64kb" }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "med-review" });
  });

  // SSE-strömmad medicineringsgenomgång. Varje orkestrator-event skickas som
  // ett SSE data-meddelande → tre-kolumns-UI:t (AC6) renderar live.
  app.get("/api/med-review/:patientId/stream", async (req: Request, res: Response) => {
    const patientId = req.params.patientId;
    const age = req.query.age ? Number(req.query.age) : undefined;

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const emit = (e: StreamEvent) => {
      res.write(`data: ${JSON.stringify(e)}\n\n`);
    };

    const options = parseDebugInject(req, deps.logger);
    deps.logger.info({ patientId, age }, "med-review stream start");
    await runReview(patientId, age, deps.aqlClient, emit, undefined, options);
    res.write("event: end\ndata: {}\n\n");
    res.end();
  });

  // Icke-strömmad variant (test/debug) — samlar alla events och returnerar dem.
  app.get("/api/med-review/:patientId", async (req: Request, res: Response) => {
    const patientId = req.params.patientId;
    const age = req.query.age ? Number(req.query.age) : undefined;
    const events: StreamEvent[] = [];
    const options = parseDebugInject(req, deps.logger);
    await runReview(patientId, age, deps.aqlClient, (e) => events.push(e), undefined, options);
    res.json({ patientId, events });
  });

  return app;
}
