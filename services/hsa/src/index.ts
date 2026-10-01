import { indexCatalog, loadCatalog } from './catalog.js';
import { createServer } from './server.js';

async function main(): Promise<void> {
  const port = Number(process.env.HSA_PORT ?? process.env.PORT ?? 11105);
  const catalogPath = process.env.HSA_CATALOG_PATH;
  const catalog = await loadCatalog(catalogPath);
  const { personsById, unitsById } = indexCatalog(catalog);
  const app = createServer({ personsById, unitsById });
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`hsa stub listening on ${port} (synthetic catalog, dataklass 0)`);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('hsa bootstrap failed', err);
  process.exit(1);
});
