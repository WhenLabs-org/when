import * as path from "node:path";
import ora from "ora";
import { detectStack, stackToConfig, formatStackSummary } from "../detectors/index.js";
import { resolveFragments } from "../fragments/index.js";
import { generateAll } from "../generators/index.js";
import { createDefaultConfig, saveConfig, configExists } from "../utils/config.js";
import { writeFile, fileExists, listDir } from "../utils/fs.js";
import { log } from "../utils/logger.js";
import { confirm } from "../utils/prompts.js";
import { CONFIG_FILE } from "../constants.js";
import type { TargetsConfig } from "../types.js";

interface InitOptions {
  targets: string;
  force: boolean;
  detect: boolean;
}

export async function initCommand(options: InitOptions): Promise<void> {
  const projectRoot = process.cwd();

  // Check for existing config
  if (await configExists(projectRoot)) {
    if (!options.force) {
      const overwrite = await confirm(`${CONFIG_FILE} already exists. Overwrite?`);
      if (!overwrite) {
        log.info("Aborted.");
        return;
      }
    }
  }

  // Parse targets
  const targetNames = options.targets.split(",").map((t) => t.trim());
  const targets: TargetsConfig = {
    claude: targetNames.includes("claude"),
    cursor: targetNames.includes("cursor"),
    copilot: targetNames.includes("copilot"),
    agents: targetNames.includes("agents"),
  };

  if (!targets.claude && !targets.cursor && !targets.copilot && !targets.agents) {
    log.error("No valid targets specified. Use: claude, cursor, copilot, agents");
    process.exit(1);
  }

  // Detect stack
  const spinner = ora("Detecting project stack...").start();
  const stack = options.detect !== false ? await detectStack(projectRoot) : {
    framework: null, language: null, styling: null, orm: null, database: null,
    testing: [], linting: [], packageManager: null, monorepo: null,
    deployment: null, auth: null, apiStyle: null,
  };
  spinner.stop();

  if (options.detect !== false) {
    log.header("\nDetected stack:");
    log.plain(formatStackSummary(stack));
    log.plain("");
  }

  // Build config
  const projectName = path.basename(projectRoot);
  const stackConfig = stackToConfig(stack);
  const config = createDefaultConfig(projectName, stackConfig, targets);

  // Auto-detect directory structure
  const srcDirs = await listDir(path.join(projectRoot, "src"));
  for (const dir of srcDirs) {
    const fullPath = path.join(projectRoot, "src", dir);
    if (await fileExists(fullPath)) {
      config.structure[`src/${dir}/`] = "";
    }
  }

  // Save config
  await saveConfig(projectRoot, config);
  log.success(`${CONFIG_FILE} created`);

  // Generate files
  const genSpinner = ora("Generating AI context files...").start();
  const fragments = resolveFragments(stack, config);
  const results = generateAll(stack, config, fragments);
  genSpinner.stop();

  for (const result of results) {
    const outputPath = path.join(projectRoot, result.filePath);
    await writeFile(outputPath, result.content);
    log.success(`${result.filePath} (${result.sections} sections)`);
  }

  log.plain("");
  log.dim(`Files created. Review and customize ${CONFIG_FILE}, then run \`aware sync\` after edits.`);
}
