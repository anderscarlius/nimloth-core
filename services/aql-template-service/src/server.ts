import express, { type Request, type Response, type NextFunction } from "express";
import type { Logger } from "pino";
import { mockAuth } from "./middleware/mock-auth.js";
import { TemplateRegistry } from "./registry.js";
import { validateAndApplyDefaults, bindParams, ParameterBindError } from "./param-binder.js";
import { runAql, EhrbaseError } from "./ehrbase-client.js";
import type {
  ListResponse,
  ExecuteRequest,
  ExecuteResponse,
  ErrorBody,
} from "./types.js";

export interface ServerDeps {
  registry: TemplateRegistry;
  ehrbaseBaseUrl: string;
  logger: Logger;
}

export function createServer(deps: ServerDeps): express.Express {
  const app = express();
  app.use(express.json({ limit: "256kb" }));
  app.use(mockAuth);

  // Health
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", templates: deps.registry.size() });
  });

  // List
  app.get("/api/aql-templates", (_req, res) => {
    const body: ListResponse = {
      templates: deps.registry.list(),
      total: deps.registry.size(),
    };
    res.json(body);
  });

  // Get one
  app.get("/api/aql-templates/:id", (req: Request, res: Response) => {
    const t = deps.registry.get(req.params.id);
    if (!t) return sendNotFound(res, req.params.id);
    const { aql: _aql, postProcess: _pp, ...descriptor } = t;
    res.json(descriptor);
  });

  // Execute
  app.post("/api/aql-templates/:id/execute", async (req: Request, res: Response, next: NextFunction) => {
    const id = req.params.id;
    const t = deps.registry.get(id);
    if (!t) return sendNotFound(res, id);
    const t0 = Date.now();
    try {
      const callerParams = (req.body as ExecuteRequest | undefined)?.params ?? {};
      const bound = validateAndApplyDefaults(t.parameters, callerParams as Record<string, unknown>);
      const aql = bindParams(t.aql, bound);
      const tEhrbase0 = Date.now();
      const raw = await runAql(deps.ehrbaseBaseUrl, aql);
      const ehrbaseMs = Date.now() - tEhrbase0;
      const rawRows = raw.rows ?? [];
      const rows = t.postProcess ? t.postProcess(rawRows, bound) : rawRows;
      const body: ExecuteResponse = {
        template_id: t.id,
        template_version: t.version,
        executed_at: new Date().toISOString(),
        row_count: rows.length,
        rows,
        meta: { ehrbase_ms: ehrbaseMs, total_ms: Date.now() - t0 },
      };
      res.json(body);
    } catch (err) {
      if (err instanceof ParameterBindError) {
        const body: ErrorBody = {
          error: "parameter_validation_failed",
          message: err.message,
          details: { field: err.field },
        };
        return res.status(400).json(body);
      }
      if (err instanceof EhrbaseError) {
        deps.logger.error({ err, templateId: id, status: err.status }, "EHRbase execute failure");
        const body: ErrorBody = {
          error: "ehrbase_error",
          message: `EHRbase responded with HTTP ${err.status}`,
          details: { ehrbase_status: err.status, ehrbase_body_snippet: err.body.slice(0, 400) },
        };
        return res.status(500).json(body);
      }
      next(err);
    }
  });

  // Fallback error handler — keep last
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    deps.logger.error({ err }, "Unhandled error");
    const body: ErrorBody = { error: "internal_error", message: err.message };
    res.status(500).json(body);
  });

  return app;
}

function sendNotFound(res: Response, id: string): void {
  const body: ErrorBody = { error: "template_not_found", message: `No template with id '${id}'` };
  res.status(404).json(body);
}
