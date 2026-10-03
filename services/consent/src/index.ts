import { createServer } from './server.js';
import { indexRegistry, loadRegistry } from './registry.js';

async function main(): Promise<void> {
  const port = Number(process.env.CONSENT_PORT ?? process.env.PORT ?? 11106);
  const registry = await loadRegistry();
  const index = indexRegistry(registry);
  const app = createServer({ index });
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`consent/spärr stub listening on ${port} (dataklass 0, synthetic)`);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('consent bootstrap failed', err);
  process.exit(1);
});
