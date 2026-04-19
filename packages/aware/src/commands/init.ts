import * as path from "node:path";
import ora from "ora";
import { formatStackSummary } from "../detectors/index.js";
import { saveConfig, configExists } from "../utils/config.js";
import { writeFile } from "../utils/fs.js";
import { log } from "../utils/logger.js";
import { confirm } from "../utils/prompts.js";
import { CONFIG_FILE } from "../constants.js";
import { scan } from "../scan.js";
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

  // Parse targets — "all" is shorthand for claude,cursor,copilot,agents
  const rawTargets = options.targets.split(",").map((t) => t.trim());
  const isAll = rawTargets.includes("all");
  const targets: TargetsConfig = {
    claude: isAll || rawTargets.includes("claude"),
    cursor: isAll || rawTargets.includes("cursor"),
    copilot: isAll || rawTargets.includes("copilot"),
    agents: isAll || rawTargets.includes("agents"),
  };

  if (!targets.claude && !targets.cursor && !targets.copilot && !targets.agents) {
    log.error("No valid targets specified. Use: claude, cursor, copilot, agents, all");
    process.exit(1);
  }

  // Detect stack + compose config + generate files (all pure, no I/O)
  const detectSpinner = ora("Detecting project stack...").start();
  const result = await scan({
    projectRoot,
    targets,
    detect: options.detect !== false,
  });
  detectSpinner.stop();

  if (options.detect !== false) {
    log.header("\nDetected stack:");
    log.plain(formatStackSummary(result.stack));
    log.plain("");
  }

  // Save config
  await saveConfig(projectRoot, result.config);
  log.success(`${CONFIG_FILE} created`);

  // Write generated files
  const genSpinner = ora("Generating AI context files...").start();
  genSpinner.stop();

  for (const file of result.generatedFiles) {
    const outputPath = path.join(projectRoot, file.path);
    await writeFile(outputPath, file.content);
    log.success(`${file.path} (${file.sections} sections)`);
  }

  log.plain("");
  log.dim(`Files created. Review and customize ${CONFIG_FILE}, then run \`aware sync\` after edits.`);
}
