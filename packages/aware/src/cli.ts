import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { syncCommand } from "./commands/sync.js";
import { diffCommand } from "./commands/diff.js";
import { watchCommand } from "./commands/watch.js";
import { validateCommand } from "./commands/validate.js";
import { doctorCommand } from "./commands/doctor.js";
import { addCommand } from "./commands/add.js";
import { VERSION } from "./constants.js";

const program = new Command();

program
  .name("aware")
  .description("Auto-detect your stack and generate AI context files")
  .version(VERSION);

program
  .command("init")
  .description("Detect project stack and generate AI context files")
  .option("-t, --targets <targets>", "Comma-separated targets: claude,cursor,copilot,agents,all", "claude,cursor,copilot,agents")
  .option("-f, --force", "Overwrite existing files without prompting", false)
  .option("--no-detect", "Skip auto-detection, create empty config")
  .action(initCommand);

program
  .command("sync")
  .description("Regenerate target files from .aware.json")
  .option("--dry-run", "Show what would change without writing files", false)
  .action(syncCommand);

program
  .command("diff")
  .description("Show project changes since last sync")
  .option("--exit-code", "Exit 0 if no changes, exit 1 if changes detected", false)
  .action(diffCommand);

program
  .command("watch")
  .description("Watch for project changes and auto-update context files")
  .option("--auto-sync", "Automatically sync without prompting", false)
  .option("--debounce <ms>", "Milliseconds to wait after changes before triggering", (val: string) => parseInt(val, 10), 2000)
  .action(watchCommand);

program
  .command("validate")
  .description("Validate .aware.json schema and content")
  .action(validateCommand);

program
  .command("doctor")
  .description("Diagnose project health: config issues, stack drift, stale files")
  .action(doctorCommand);

program
  .command("add")
  .description("Add a rule, convention, or structure entry to .aware.json")
  .requiredOption("-t, --type <type>", "Type to add: rule, convention, structure")
  .action(addCommand);

program.parse();
