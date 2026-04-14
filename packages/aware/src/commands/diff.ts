import { detectStack, stackToConfig } from "../detectors/index.js";
import { loadConfig } from "../utils/config.js";
import { log } from "../utils/logger.js";
import { parsePackageJson } from "../utils/parsers.js";
import { confirm } from "../utils/prompts.js";
import { syncCommand } from "./sync.js";

export async function diffCommand(): Promise<void> {
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

  log.header(`Changes since last sync (${timeAgo}):\n`);

  // Compare stack
  let hasChanges = false;
  const oldStack = config.stack;

  log.header("STACK CHANGES:");
  for (const key of Object.keys(newStackConfig) as (keyof typeof newStackConfig)[]) {
    const oldVal = JSON.stringify(oldStack[key]);
    const newVal = JSON.stringify(newStackConfig[key]);
    if (oldVal !== newVal) {
      hasChanges = true;
      log.plain(`  ${key}: ${oldVal} → ${newVal}`);
    }
  }
  if (!hasChanges) {
    log.dim("  No stack changes detected.");
  }

  // Compare deps
  log.plain("");
  log.header("DEPENDENCY CHANGES:");
  const pkg = await parsePackageJson(projectRoot);
  if (pkg) {
    const currentDeps = new Set([
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ]);

    // We can only compare against what's in the stack config since we don't store full dep lists
    // Show current dep count as context
    log.dim(`  ${currentDeps.size} dependencies currently installed`);
  } else {
    log.dim("  No package.json found.");
  }

  // Suggestions
  log.plain("");
  log.header("SUGGESTED UPDATES:");
  const suggestions: string[] = [];

  if (hasChanges) {
    suggestions.push("Run `aware sync` to regenerate context files with updated stack");
  }

  if (!config.project.description) {
    suggestions.push("Add a project description in .aware.json (project.description)");
  }
  if (!config.project.architecture) {
    suggestions.push("Add architecture description in .aware.json (project.architecture)");
  }
  if (config.rules.length === 0) {
    suggestions.push("Add project-specific rules in .aware.json (rules array)");
  }
  if (Object.keys(config.conventions).length === 0) {
    suggestions.push("Add coding conventions in .aware.json (conventions object)");
  }

  if (suggestions.length === 0) {
    log.success("  Everything looks good!");
  } else {
    for (let i = 0; i < suggestions.length; i++) {
      log.plain(`  ${i + 1}. ${suggestions[i]}`);
    }
  }

  // Offer to sync
  if (hasChanges) {
    log.plain("");
    const apply = await confirm("Apply stack changes and sync?");
    if (apply) {
      await syncCommand({ dryRun: false });
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
