import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { syncCommand } from "./commands/sync.js";
import { diffCommand } from "./commands/diff.js";
import { VERSION } from "./constants.js";
import type { TargetName } from "./types.js";

const program = new Command();

program
  .name("aware")
  .description("Auto-detect your stack and generate AI context files")
  .version(VERSION);

program
  .command("init")
  .description("Detect project stack and generate AI context files")
  .option(
    "-t, --targets <targets>",
    "Comma-separated targets: claude,cursor,copilot,agents,all",
    "claude,cursor,copilot,agents",
  )
  .option("-f, --force", "Overwrite existing files without prompting", false)
  .option("--no-detect", "Skip auto-detection, create empty config")
  .option(
    "--workspace",
    "Monorepo mode: discover workspace packages and scaffold a per-package .aware.json that extends the root",
    false,
  )
  .action(initCommand);

program
  .command("sync")
  .description("Regenerate target files from .aware.json")
  .option("--dry-run", "Show what would change without writing files", false)
  .action((opts) => syncCommand({ dryRun: opts.dryRun }));

program
  .command("diff")
  .description("Show stack drift and generated-file drift since last sync")
  .option(
    "--check",
    "CI mode: exit 0/1/2 for clean/drift/tamper; no interactive prompt",
    false,
  )
  .option("--json", "Emit a machine-readable DriftReport as JSON", false)
  .option(
    "--target <target>",
    "Narrow content drift to one target (claude|cursor|copilot|agents)",
  )
  .option("--quiet", "Suppress human output (useful with --check)", false)
  .action((opts) =>
    diffCommand({
      check: opts.check,
      json: opts.json,
      target: opts.target as TargetName | undefined,
      quiet: opts.quiet,
      exitCode: false,
    }),
  );

program.parse();
