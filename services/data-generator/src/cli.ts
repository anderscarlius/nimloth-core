// Top-level CLI dispatcher. Detailed implementations live in feature modules.
const [, , command, ...rest] = process.argv;

async function main() {
  switch (command) {
    case "list-templates": {
      await import("./scripts/list-templates.js").then((m) =>
        (m as { default?: () => Promise<void> }).default?.(),
      );
      return;
    }
    case "inventory": {
      const m = await import("./scripts/inventory.js");
      await (m as { runInventory: (args: string[]) => Promise<void> }).runInventory(rest);
      return;
    }
    case "generate:load":
    case "demo:aql":
      console.error(`Command '${command}' not yet implemented (TODO SDG-06/SDG-08).`);
      process.exit(2);
      return;
    default:
      console.error(
        `Usage: data-generator <command>\n  list-templates\n  inventory\n  generate:load [--profile <id>] [--count <N>] [--seed <N>] [--dry-run]\n  demo:aql [--id AQL-XX | --category A|B|C]`,
      );
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
