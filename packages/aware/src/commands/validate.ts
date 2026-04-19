import * as path from "node:path";
import { readFile, fileExists } from "../utils/fs.js";
import { log } from "../utils/logger.js";
import { CONFIG_FILE } from "../constants.js";

export async function validateCommand(): Promise<void> {
  const projectRoot = process.cwd();
  const configPath = path.join(projectRoot, CONFIG_FILE);

  const content = await readFile(configPath);
  if (!content) {
    log.error(`${CONFIG_FILE} not found.`);
    process.exit(1);
  }

  let config: Record<string, unknown>;
  try {
    config = JSON.parse(content) as Record<string, unknown>;
  } catch (e) {
    log.error(`${CONFIG_FILE} contains invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }

  const errors: string[] = [];
  const warnings: string[] = [];

  // Schema validation
  if (typeof config["version"] !== "number") {
    errors.push("`version` must be a number");
  }

  const project = config["project"] as Record<string, unknown> | undefined;
  if (!project || typeof project !== "object") {
    errors.push("`project` must be an object");
  } else if (typeof project["name"] !== "string" || project["name"] === "") {
    errors.push("`project.name` must be a non-empty string");
  }

  const stack = config["stack"] as Record<string, unknown> | undefined;
  if (!stack || typeof stack !== "object") {
    errors.push("`stack` must be an object");
  }

  const conventions = config["conventions"];
  if (conventions !== undefined && (typeof conventions !== "object" || conventions === null)) {
    errors.push("`conventions` must be an object");
  }

  const rules = config["rules"];
  if (rules !== undefined) {
    if (!Array.isArray(rules)) {
      errors.push("`rules` must be an array");
    } else {
      for (let i = 0; i < rules.length; i++) {
        if (typeof rules[i] !== "string" || (rules[i] as string).trim() === "") {
          warnings.push(`rules[${i}] is empty or not a string`);
        }
      }
    }
  }

  const structure = config["structure"] as Record<string, unknown> | undefined;
  if (structure !== undefined && typeof structure === "object" && structure !== null) {
    for (const [dirPath, desc] of Object.entries(structure)) {
      if (typeof desc !== "string") {
        errors.push(`structure["${dirPath}"] must be a string`);
      }
      const fullPath = path.join(projectRoot, dirPath);
      if (!(await fileExists(fullPath))) {
        warnings.push(`structure path "${dirPath}" does not exist on disk`);
      }
    }
  }

  const targets = config["targets"] as Record<string, unknown> | undefined;
  if (!targets || typeof targets !== "object") {
    errors.push("`targets` must be an object");
  } else {
    const hasEnabled = Object.values(targets).some((v) => v === true);
    if (!hasEnabled) {
      warnings.push("No targets are enabled — nothing will be generated");
    }
  }

  // Print results
  log.header(`Validating ${CONFIG_FILE}...\n`);

  if (errors.length === 0 && warnings.length === 0) {
    log.success("Config is valid. No issues found.");
    return;
  }

  for (const err of errors) {
    log.error(err);
  }
  for (const warn of warnings) {
    log.warn(warn);
  }

  log.plain("");
  if (errors.length > 0) {
    log.error(`${errors.length} error(s), ${warnings.length} warning(s)`);
    process.exit(1);
  } else {
    log.success(`Valid with ${warnings.length} warning(s)`);
  }
}
