import pino from "pino";
import { loadConfig } from "./config.js";
import { createServer } from "./server.js";
import { TemplateRegistry } from "./registry.js";
import { ALL_TEMPLATES } from "./templates/index.js";

function main(): void {
  const config = loadConfig();
  const logger = pino({ level: config.logLevel, base: { service: "aql-template-service" } });

  logger.info(
    { ehrbase: config.ehrbaseBaseUrl, port: config.port, template_count: ALL_TEMPLATES.length },
    "Starting AQL template service (MVP)",
  );

  let registry: TemplateRegistry;
  try {
    registry = new TemplateRegistry(ALL_TEMPLATES);
  } catch (err) {
    logger.error({ err }, "Registry validation failed — refusing to start");
    process.exit(1);
  }

  const app = createServer({
    registry,
    ehrbaseBaseUrl: config.ehrbaseBaseUrl,
    logger,
    corsAllowedOrigins: config.corsAllowedOrigins,
  });
  app.listen(config.port, () => {
    logger.info({ port: config.port, templates: registry.size() }, "HTTP server ready");
  });
}

main();
