import * as path from "node:path";
import ora from "ora";
import { loadConfig, computeDetectionHash } from "../utils/config.js";
import { fileExists, readFile } from "../utils/fs.js";
import { log } from "../utils/logger.js";
import { CONFIG_FILE, TARGETS } from "../constants.js";
import { detectStack, stackToConfig } from "../detectors/index.js";
import type { AwareConfig, TargetsConfig } from "../types.js";

interface DiagnosticResult {
  label: string;
  status: "ok" | "warn" | "error";
  message: string;
}

export async function doctorCommand(): Promise<void> {
  const projectRoot = process.cwd();
  const results: DiagnosticResult[] = [];

  log.header("aware doctor\n");

  // 1. Check config exists and is valid JSON
  const configPath = path.join(projectRoot, CONFIG_FILE);
  const configContent = await readFile(configPath);

  if (!configContent) {
    log.error(`${CONFIG_FILE} not found. Run \`aware init\` first.`);
    process.exit(1);
  }

  let config: AwareConfig;
  try {
    config = JSON.parse(configContent) as AwareConfig;
    results.push({ label: "Config file", status: "ok", message: `${CONFIG_FILE} found and valid JSON` });
  } catch {
    log.error(`${CONFIG_FILE} contains invalid JSON.`);
    process.exit(1);
  }

  // 2. Schema basics
  if (!config.version || !config.project?.name || !config.stack || !config.targets) {
    results.push({ label: "Config schema", status: "error", message: "Missing required fields (version, project.name, stack, targets)" });
  } else {
    results.push({ label: "Config schema", status: "ok", message: "All required fields present" });
  }

  // 3. Check enabled targets have generated files
  const targetEntries = Object.entries(TARGETS) as Array<[keyof TargetsConfig, { file: string; name: string }]>;
  for (const [key, target] of targetEntries) {
    if (config.targets[key]) {
      const filePath = path.join(projectRoot, target.file);
      if (await fileExists(filePath)) {
        results.push({ label: target.name, status: "ok", message: `${target.file} exists` });
      } else {
        results.push({ label: target.name, status: "warn", message: `${target.file} missing — run \`aware sync\`` });
      }
    }
  }

  // 4. Check for disabled targets that have stale files
  for (const [key, target] of targetEntries) {
    if (!config.targets[key]) {
      const filePath = path.join(projectRoot, target.file);
      if (await fileExists(filePath)) {
        results.push({ label: target.name, status: "warn", message: `${target.file} exists but target is disabled — consider removing it` });
      }
    }
  }

  // 5. Stack drift detection
  const spinner = ora("Re-detecting stack...").start();
  const currentStack = await detectStack(projectRoot);
  const currentConfig = stackToConfig(currentStack);
  spinner.stop();

  const currentHash = computeDetectionHash(currentConfig);
  const savedHash = config._meta?.lastDetectionHash;

  if (savedHash && currentHash !== savedHash) {
    // Find what changed
    const drifted: string[] = [];
    const configStack = config.stack;
    for (const key of Object.keys(currentConfig) as Array<keyof typeof currentConfig>) {
      const current = currentConfig[key];
      const saved = configStack[key];
      const currentStr = Array.isArray(current) ? current.join(",") : (current ?? "");
      const savedStr = Array.isArray(saved) ? saved.join(",") : (saved ?? "");
      if (currentStr !== savedStr) {
        drifted.push(key);
      }
    }
    results.push({
      label: "Stack drift",
      status: "warn",
      message: `Stack has changed since last sync: ${drifted.join(", ")}. Run \`aware sync\``,
    });
  } else {
    results.push({ label: "Stack drift", status: "ok", message: "Stack matches last detection" });
  }

  // 6. Check structure paths exist
  if (config.structure) {
    const missingPaths: string[] = [];
    for (const dirPath of Object.keys(config.structure)) {
      const fullPath = path.join(projectRoot, dirPath);
      if (!(await fileExists(fullPath))) {
        missingPaths.push(dirPath);
      }
    }
    if (missingPaths.length > 0) {
      results.push({
        label: "Structure",
        status: "warn",
        message: `${missingPaths.length} configured path(s) missing: ${missingPaths.slice(0, 3).join(", ")}${missingPaths.length > 3 ? "..." : ""}`,
      });
    } else if (Object.keys(config.structure).length > 0) {
      results.push({ label: "Structure", status: "ok", message: "All configured paths exist" });
    }
  }

  // 7. Check for empty project description
  if (!config.project.description) {
    results.push({ label: "Description", status: "warn", message: "project.description is empty — consider adding one" });
  }

  // 8. Check rules
  if (!config.rules || config.rules.length === 0) {
    results.push({ label: "Custom rules", status: "warn", message: "No custom rules defined — add project-specific rules to improve context quality" });
  } else {
    results.push({ label: "Custom rules", status: "ok", message: `${config.rules.length} rule(s) defined` });
  }

  // 9. Staleness check
  if (config._meta?.lastSyncedAt) {
    const syncDate = new Date(config._meta.lastSyncedAt);
    const daysSinceSync = Math.floor((Date.now() - syncDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysSinceSync > 30) {
      results.push({ label: "Freshness", status: "warn", message: `Last synced ${daysSinceSync} days ago — consider running \`aware sync\`` });
    } else {
      results.push({ label: "Freshness", status: "ok", message: `Last synced ${daysSinceSync} day(s) ago` });
    }
  } else {
    results.push({ label: "Freshness", status: "warn", message: "Never synced — run \`aware sync\` after reviewing config" });
  }

  // Print results
  log.plain("");
  let errors = 0;
  let warnings = 0;

  for (const r of results) {
    if (r.status === "ok") {
      log.success(`${r.label}: ${r.message}`);
    } else if (r.status === "warn") {
      log.warn(`${r.label}: ${r.message}`);
      warnings++;
    } else {
      log.error(`${r.label}: ${r.message}`);
      errors++;
    }
  }

  log.plain("");
  if (errors > 0) {
    log.error(`${errors} error(s), ${warnings} warning(s)`);
    process.exit(1);
  } else if (warnings > 0) {
    log.warn(`All checks passed with ${warnings} warning(s)`);
  } else {
    log.success("All checks passed. Project is healthy.");
  }
}
