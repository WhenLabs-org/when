import chalk from "chalk";
import { detectStack, stackToConfig, formatStackSummary } from "../detectors/index.js";
import { loadConfig } from "../utils/config.js";
import { log } from "../utils/logger.js";
import { confirm } from "../utils/prompts.js";
import { syncCommand } from "./sync.js";
import type { StackConfig } from "../types.js";

const KEY_LABELS: Record<string, string> = {
  framework: "Framework",
  language: "Language",
  styling: "Styling",
  orm: "ORM",
  database: "Database",
  testing: "Testing",
  linting: "Linting",
  packageManager: "Package Manager",
  monorepo: "Monorepo",
  deployment: "Deployment",
  auth: "Auth",
  apiStyle: "API Style",
  stateManagement: "State Mgmt",
  cicd: "CI/CD",
  bundler: "Bundler",
};

interface DiffOptions {
  exitCode?: boolean;
}

export async function diffCommand(options: DiffOptions = {}): Promise<void> {
  const projectRoot = process.cwd();

  const config = await loadConfig(projectRoot);
  if (!config) {
    log.error("No .aware.json found. Run `aware init` first.");
    process.exit(1);
  }

  // Re-detect
  const stack = await detectStack(projectRoot);
  const newStackConfig = stackToConfig(stack);

  const lastSync = config._meta.lastSyncedAt;
  const timeAgo = lastSync ? timeSince(new Date(lastSync)) : "never";

  log.header(`\nStack diff (last sync: ${timeAgo})\n`);

  // Compare stack with colored output
  const oldStack = config.stack;
  const changes: Array<{ key: string; label: string; old: string; new: string }> = [];
  const unchanged: string[] = [];

  for (const key of Object.keys(newStackConfig) as (keyof StackConfig)[]) {
    const oldVal = formatValue(oldStack[key]);
    const newVal = formatValue(newStackConfig[key]);
    const label = KEY_LABELS[key] ?? key;

    if (oldVal !== newVal) {
      changes.push({ key, label, old: oldVal, new: newVal });
    } else if (oldVal !== "--") {
      unchanged.push(`${label}: ${oldVal}`);
    }
  }

  if (changes.length === 0) {
    log.success("No stack changes detected.\n");
    printUnchanged(unchanged);
    printSuggestions(config);
    if (options.exitCode) {
      process.exit(0);
    }
    return;
  }

  // Print changes table
  const labelWidth = Math.max(...changes.map((c) => c.label.length), 12);

  for (const change of changes) {
    const padded = change.label.padEnd(labelWidth);

    if (change.old === "--" && change.new !== "--") {
      // New addition
      console.log(`  ${chalk.green("+")} ${padded}  ${chalk.green(change.new)}`);
    } else if (change.old !== "--" && change.new === "--") {
      // Removal
      console.log(`  ${chalk.red("-")} ${padded}  ${chalk.red.strikethrough(change.old)}`);
    } else {
      // Change
      console.log(`  ${chalk.yellow("~")} ${padded}  ${chalk.red(change.old)} ${chalk.dim("→")} ${chalk.green(change.new)}`);
    }
  }

  log.plain("");
  log.dim(`  ${changes.length} change(s), ${unchanged.length} unchanged`);

  // Print unchanged (collapsed)
  printUnchanged(unchanged);

  // Suggestions
  printSuggestions(config);

  // In exit-code mode, exit 1 to signal changes were detected (useful for CI/scripting)
  if (options.exitCode) {
    process.exit(1);
  }

  // Offer to sync
  log.plain("");
  const apply = await confirm("Apply changes and sync?");
  if (apply) {
    await syncCommand({ dryRun: false });
  }
}

function formatValue(val: string | string[] | null | undefined): string {
  if (val === null || val === undefined) return "--";
  if (Array.isArray(val)) {
    return val.length === 0 ? "--" : val.join(", ");
  }
  return val;
}

function printUnchanged(unchanged: string[]): void {
  if (unchanged.length > 0) {
    log.plain("");
    log.dim(`  Unchanged: ${unchanged.join(", ")}`);
  }
}

function printSuggestions(config: { project: { description: string; architecture: string }; rules: string[]; conventions: Record<string, unknown> }): void {
  const suggestions: string[] = [];

  if (!config.project.description) {
    suggestions.push("Add a project description (project.description)");
  }
  if (!config.project.architecture) {
    suggestions.push("Add architecture description (project.architecture)");
  }
  if (config.rules.length === 0) {
    suggestions.push("Add project-specific rules (rules array)");
  }

  if (suggestions.length > 0) {
    log.plain("");
    log.header("Suggestions:");
    for (const s of suggestions) {
      log.dim(`  - ${s}`);
    }
  }
}

function timeSince(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
