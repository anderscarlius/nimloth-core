import pino from "pino";
import { loadConfig } from "./config.js";
import { createServer } from "./server.js";
import { AqlClient } from "./aql-client.js";

function main(): void {
  const config = loadConfig();
  const logger = pino({ level: config.logLevel, base: { service: "med-review" } });
  logger.info(
    { aql: config.aqlTemplateBaseUrl, port: config.port },
    "Starting med-review orchestrator (Fas 3) — LLM ur beslutsvägen, deterministiska regelmotorer",
  );
  const aqlClient = new AqlClient(config.aqlTemplateBaseUrl);
  const app = createServer({ aqlClient, logger });
  app.listen(config.port, () => {
    logger.info({ port: config.port }, "HTTP server ready");
  });
}

main();
