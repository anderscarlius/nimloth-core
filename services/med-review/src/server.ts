import express, { type Request, type Response } from "express";
import type { Logger } from "pino";
import { AqlClient } from "./aql-client.js";
import { runReview, type StreamEvent } from "./orchestrator.js";

export interface ServerDeps {
  aqlClient: AqlClient;
  logger: Logger;
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

    deps.logger.info({ patientId, age }, "med-review stream start");
    await runReview(patientId, age, deps.aqlClient, emit);
    res.write("event: end\ndata: {}\n\n");
    res.end();
  });

  // Icke-strömmad variant (test/debug) — samlar alla events och returnerar dem.
  app.get("/api/med-review/:patientId", async (req: Request, res: Response) => {
    const patientId = req.params.patientId;
    const age = req.query.age ? Number(req.query.age) : undefined;
    const events: StreamEvent[] = [];
    await runReview(patientId, age, deps.aqlClient, (e) => events.push(e));
    res.json({ patientId, events });
  });

  return app;
}
