import { listTemplates } from "../ehrbase-client.js";
import { EHRBASE_BASE_URL } from "../config.js";

async function main() {
  console.log(`EHRbase: ${EHRBASE_BASE_URL}`);
  const templates = await listTemplates();
  if (templates.length === 0) {
    console.log("No templates loaded.");
    return;
  }
  console.log(`Loaded templates (${templates.length}):`);
  for (const t of templates) {
    console.log(`  - ${t.template_id}  (concept: ${t.concept})`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
