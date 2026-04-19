import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { syncCommand } from "./commands/sync.js";
import { diffCommand } from "./commands/diff.js";
import { watchCommand } from "./commands/watch.js";
import { validateCommand } from "./commands/validate.js";
import { doctorCommand } from "./commands/doctor.js";
import { addCommand } from "./commands/add.js";
import { removeCommand } from "./commands/remove.js";
import {
  fragmentsListCommand,
  fragmentsDisableCommand,
  fragmentsEnableCommand,
} from "./commands/fragments.js";
import {
  pluginAddCommand,
  pluginRemoveCommand,
  pluginListCommand,
} from "./commands/plugin.js";
import {
  installHooksCommand,
  type CiProvider,
} from "./commands/install-hooks.js";
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
  .option(
    "--refresh-conventions",
    "Re-seed user-facing convention fields from source-code extraction (pre-Phase-3 upgrade path)",
    false,
  )
  .action((opts) =>
    syncCommand({
      dryRun: opts.dryRun,
      refreshConventions: opts.refreshConventions,
    }),
  );

program
  .command("diff")
  .description(
    "Show stack drift and generated-file drift since last sync",
  )
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
  .option(
    "--exit-code",
    "(legacy) exit 1 on stack drift. Superseded by --check.",
    false,
  )
  .action((opts) =>
    diffCommand({
      check: opts.check,
      json: opts.json,
      target: opts.target as TargetName | undefined,
      quiet: opts.quiet,
      exitCode: opts.exitCode,
    }),
  );

program
  .command("install-hooks")
  .description(
    "Install a git pre-commit hook that runs `aware diff --check`, or print a CI snippet with --ci.",
  )
  .option(
    "--ci <provider>",
    "Print a CI workflow snippet (github-actions|gitlab-ci|circleci) instead of installing a git hook",
  )
  .option("-f, --force", "Overwrite an existing hook", false)
  .action((opts) =>
    installHooksCommand({
      ci: opts.ci as CiProvider | undefined,
      force: opts.force,
    }),
  );

program
  .command("watch")
  .description("Watch for project changes and auto-update context files")
  .option("--auto-sync", "Automatically sync without prompting", false)
  .option(
    "--debounce <ms>",
    "Milliseconds to wait after changes before triggering",
    (val: string) => parseInt(val, 10),
    2000,
  )
  .action(watchCommand);

program
  .command("validate")
  .description("Validate .aware.json schema and content")
  .action(validateCommand);

program
  .command("doctor")
  .description(
    "Diagnose project health: config issues, stack drift, tampered/outdated context files",
  )
  .action(doctorCommand);

program
  .command("add")
  .description("Add a rule, convention, or structure entry to .aware.json")
  .requiredOption("-t, --type <type>", "Type to add: rule, convention, structure")
  .action(addCommand);

program
  .command("remove")
  .description(
    "Remove a rule, convention, structure, or plugin entry from .aware.json",
  )
  .requiredOption(
    "-t, --type <type>",
    "Type to remove: rule, structure, convention, plugin",
  )
  .option(
    "--index <n>",
    "0-based index (for list-valued types: rule, plugin). When both --index and --id are given, --index wins.",
  )
  .option(
    "--id <key>",
    "Natural key (path for structure, dotted.path for convention, specifier for plugin)",
  )
  .action(removeCommand);

const fragments = program
  .command("fragments")
  .description("Inspect and toggle fragment visibility");
fragments
  .command("list")
  .description("List all fragments that apply to this project")
  .action(fragmentsListCommand);
fragments
  .command("disable <id>")
  .description("Suppress a fragment from generated output")
  .action((id: string) => fragmentsDisableCommand(id));
fragments
  .command("enable <id>")
  .description("Re-enable a previously-disabled fragment")
  .action((id: string) => fragmentsEnableCommand(id));

const plugin = program
  .command("plugin")
  .description("Manage the .aware.json plugins[] list");
plugin
  .command("add <specifier>")
  .description("Declare a plugin to load on every sync")
  .action((spec: string) => pluginAddCommand(spec));
plugin
  .command("remove <specifier>")
  .description("Stop loading a plugin")
  .action((spec: string) => pluginRemoveCommand(spec));
plugin
  .command("list")
  .description("Show declared plugins")
  .action(pluginListCommand);

program.parse();
