import * as path from "node:path";
import ora from "ora";
import { formatStackSummary } from "../detectors/index.js";
import { saveConfig, configExists } from "../utils/config.js";
import { writeFile } from "../utils/fs.js";
import { log } from "../utils/logger.js";
import { confirm } from "../utils/prompts.js";
import { CONFIG_FILE } from "../constants.js";
import { scan } from "../scan.js";
import {
  computeExtendsPath,
  discoverWorkspace,
  resolvePackageConfig,
  scanMonorepo,
} from "../monorepo/index.js";
import { resolveFragments } from "../fragments/index.js";
import { generateAll } from "../generators/index.js";
import type { AwareConfig, TargetsConfig } from "../types.js";

interface InitOptions {
  targets: string;
  force: boolean;
  detect: boolean;
  /**
   * Explicit monorepo mode. When true, init discovers workspace
   * packages and scaffolds a root `.aware.json` + per-package configs
   * that `extends` the root. Non-monorepo projects get an error.
   *
   * Off by default: a single-package project that happens to have
   * `turbo.json` lying around shouldn't be silently converted — users
   * opt into monorepo mode explicitly.
   */
  workspace: boolean;
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

  const targets = parseTargets(options.targets);

  if (options.workspace) {
    await initWorkspace(projectRoot, targets, options);
    return;
  }

  // Single-package path (pre-Phase-4 behavior).
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

  await saveConfig(projectRoot, result.config);
  log.success(`${CONFIG_FILE} created`);

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

/**
 * Scaffold a monorepo: root `.aware.json` (shared rules / targets /
 * `packages` glob list) plus one per-package `.aware.json` that
 * `extends` the root. Context files (CLAUDE.md etc.) are written per
 * package — each package has its own stack, so a shared root file would
 * carry mixed signals.
 */
async function initWorkspace(
  projectRoot: string,
  targets: TargetsConfig,
  options: InitOptions,
): Promise<void> {
  const discoverySpinner = ora("Discovering workspace packages...").start();
  const workspace = await discoverWorkspace(projectRoot);
  discoverySpinner.stop();

  if (!workspace.isMonorepo) {
    log.error(
      "No workspace declaration found. Expected one of: pnpm-workspace.yaml, " +
        "package.json#workspaces, lerna.json. Run without --workspace for a " +
        "single-package project.",
    );
    process.exit(1);
  }

  log.info(
    `Found ${workspace.packages.length} package(s) via ${workspace.source}.`,
  );

  const scanSpinner = ora("Scanning packages...").start();
  const mono = await scanMonorepo(projectRoot, {
    targets,
    detect: options.detect !== false,
  });
  scanSpinner.stop();

  // Root config: carries the package list, shared rules (empty by
  // default — users add theirs), and targets. The root stack is
  // captured too so `aware doctor` at the root can still report
  // something meaningful, but per-package stacks override via extends.
  const rootConfig: AwareConfig = {
    ...mono.root.config,
    packages: workspace.patterns,
  };
  await saveConfig(projectRoot, rootConfig);
  log.success(`${CONFIG_FILE} (root)`);

  for (const { pkg, result } of mono.packages) {
    // Save the per-package config first (with extends pointing at root)
    // so the subsequent resolve picks up root inheritance. Then
    // regenerate files against the merged config — otherwise the
    // freshly-written files would disagree with what sync/diff would
    // produce later (which resolve extends and re-merge), reporting
    // "outdated" on an untouched project.
    const packageConfig: AwareConfig = {
      ...result.config,
      extends: computeExtendsPath(projectRoot, pkg.absolutePath),
    };
    await saveConfig(pkg.absolutePath, packageConfig);
    log.success(`${path.join(pkg.relativePath, CONFIG_FILE)}`);

    const resolved = await resolvePackageConfig(pkg.absolutePath);
    const effectiveConfig = resolved?.config ?? packageConfig;
    // Reuse the stack that `scanMonorepo` already detected — detection
    // is the slow part (pnpm-lock parse + 15 detector runs), and
    // repeating it per package would double init time on a large repo.
    const stack = result.stack;
    const fragments = resolveFragments(stack, effectiveConfig);
    const generated = generateAll(stack, effectiveConfig, fragments);

    for (const file of generated) {
      const outputPath = path.join(pkg.absolutePath, file.filePath);
      await writeFile(outputPath, file.content);
      log.dim(
        `  ${path.join(pkg.relativePath, file.filePath)} (${file.sections} sections)`,
      );
    }
  }

  log.plain("");
  log.dim(
    `Monorepo initialized. Each package has its own context files; ` +
      `shared rules live at ${CONFIG_FILE} (root).`,
  );
}

function parseTargets(raw: string): TargetsConfig {
  const values = raw.split(",").map((t) => t.trim());
  const isAll = values.includes("all");
  const targets: TargetsConfig = {
    claude: isAll || values.includes("claude"),
    cursor: isAll || values.includes("cursor"),
    copilot: isAll || values.includes("copilot"),
    agents: isAll || values.includes("agents"),
  };

  if (!targets.claude && !targets.cursor && !targets.copilot && !targets.agents) {
    log.error("No valid targets specified. Use: claude, cursor, copilot, agents, all");
    process.exit(1);
  }
  return targets;
}
