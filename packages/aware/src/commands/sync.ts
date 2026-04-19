import * as path from "node:path";
import ora from "ora";
import { detectStack, stackToConfig } from "../detectors/index.js";
import { ROOT_PACKAGE_KEY } from "../diff/index.js";
import { resolveFragments } from "../fragments/index.js";
import { generateAll } from "../generators/index.js";
import { extractStampedHash } from "../core/hash.js";
import { extractConventions } from "../conventions/extractor.js";
import { discoverWorkspace, resolvePackageConfig } from "../monorepo/index.js";
import { loadPlugins } from "../plugins/loader.js";
import { loadConfig, saveConfig, computeDetectionHash } from "../utils/config.js";
import { readFile, writeFile } from "../utils/fs.js";
import { log } from "../utils/logger.js";
import type { AwareConfig, DetectedStack, TargetName } from "../types.js";

interface SyncOptions {
  dryRun: boolean;
  /**
   * Re-seed user-facing convention fields (`conventions.naming` etc.)
   * from freshly-extracted values. Default sync never touches those —
   * they're user-authoritative once init has set them. Projects that
   * upgraded from pre-Phase-3 aware got framework defaults that never
   * reflected real code; this flag opts into one-shot refresh.
   */
  refreshConventions?: boolean;
}

export async function syncCommand(options: SyncOptions): Promise<void> {
  const projectRoot = process.cwd();

  const config = await loadConfig(projectRoot);
  if (!config) {
    log.error("No .aware.json found. Run `aware init` first.");
    process.exit(1);
  }

  // Monorepo: root declares `packages`, iterate each package.
  // A package's `.aware.json` typically `extends` the root, so its
  // resolved config inherits shared rules/targets/conventions.
  if (config.packages && config.packages.length > 0) {
    await syncMonorepo(projectRoot, options);
    return;
  }

  await syncSingle(projectRoot, config, options);
}

async function syncMonorepo(
  projectRoot: string,
  options: SyncOptions,
): Promise<void> {
  const discovery = await discoverWorkspace(projectRoot);
  if (!discovery.isMonorepo) {
    log.error(
      "Root .aware.json declares `packages` but no workspace declaration " +
        "was found (pnpm-workspace.yaml / package.json#workspaces / lerna.json).",
    );
    process.exit(1);
  }

  log.info(
    `Syncing ${discovery.packages.length} package(s) (via ${discovery.source}).`,
  );
  for (const pkg of discovery.packages) {
    const resolved = await resolvePackageConfig(pkg.absolutePath).catch(
      (err) => {
        log.error(`${pkg.relativePath}: ${(err as Error).message}`);
        return null;
      },
    );
    if (!resolved) {
      log.warn(
        `${pkg.relativePath}: no .aware.json — run \`aware init\` inside the package or re-run \`aware init --workspace\` at the root.`,
      );
      continue;
    }
    log.header(`\n${pkg.relativePath}`);
    await syncSingle(pkg.absolutePath, resolved.config, options);
  }
}

async function syncSingle(
  projectRoot: string,
  config: AwareConfig,
  options: SyncOptions,
): Promise<void> {
  // Load any declared plugins up-front. Registrations feed the shared
  // fragment registry, which resolveFragments will read below.
  if (config.plugins && config.plugins.length > 0) {
    await loadPlugins({ projectRoot, pluginSpecifiers: config.plugins });
  }

  // Re-detect stack
  const spinner = ora("Detecting current stack...").start();
  const stack: DetectedStack = await detectStack(projectRoot);
  const newStackConfig = stackToConfig(stack);
  const newHash = computeDetectionHash(newStackConfig);
  spinner.stop();

  // Check for stack changes
  if (newHash !== config._meta.lastDetectionHash) {
    log.info("Stack changes detected since last sync:");
    const oldStack = config.stack;
    for (const key of Object.keys(newStackConfig) as (keyof typeof newStackConfig)[]) {
      const oldVal = JSON.stringify(oldStack[key]);
      const newVal = JSON.stringify(newStackConfig[key]);
      if (oldVal !== newVal) {
        log.plain(`  ${key}: ${oldVal} → ${newVal}`);
      }
    }
    log.plain("");

    // Merge new detections into config (preserve user overrides for non-null existing values)
    for (const key of Object.keys(newStackConfig) as (keyof typeof newStackConfig)[]) {
      const current = config.stack[key];
      const detected = newStackConfig[key];
      if (current === null || (Array.isArray(current) && current.length === 0)) {
        (config.stack as unknown as Record<string, unknown>)[key] = detected;
      }
    }
  }

  // Refresh convention extraction unless the user opted out. We update
  // only `conventions.extracted` — the top-level `conventions.naming`
  // etc. are user-authoritative once init has run, and a later sync
  // must never clobber a hand-edit. Downstream generators read from the
  // top-level fields as before; `extracted` is for record-keeping and
  // future drift-against-extracted-conventions detection.
  //
  // Exception: `--refresh-conventions` re-seeds the top-level fields
  // from fresh extraction. This is the escape hatch for projects that
  // initialized before Phase 3 and want to adopt the new values.
  if (config.conventions.extract !== false) {
    const extractSpinner = ora("Sampling source files...").start();
    const extracted = await extractConventions(projectRoot);
    extractSpinner.stop();
    config.conventions.extracted = extracted;

    if (options.refreshConventions) {
      if (extracted.naming) {
        config.conventions.naming = {
          ...(config.conventions.naming ?? {}),
          ...extracted.naming,
        };
      }
      if (extracted.tests) {
        config.conventions.testing = {
          ...(config.conventions.testing ?? {}),
          ...extracted.tests,
        };
      }
      log.info(
        "Refreshed user-facing conventions from source-code extraction.",
      );
    }
  }

  // Generate
  const fragments = resolveFragments(stack, config);
  const results = generateAll(stack, config, fragments);

  // Write or dry-run
  let changesCount = 0;
  const writtenHashes: Partial<Record<TargetName, string>> = {};
  const writtenVersions: Partial<Record<TargetName, Record<string, string>>> =
    {};

  for (const result of results) {
    const outputPath = path.join(projectRoot, result.filePath);
    const existing = await readFile(outputPath);

    // Record provenance regardless of whether we actually write (so the
    // config reflects the full set of enabled targets after sync).
    const embedded = extractStampedHash(result.content);
    if (embedded) writtenHashes[result.target] = embedded;
    const fragmentVersions: Record<string, string> = {};
    for (const f of fragments) {
      if (f.version !== undefined) fragmentVersions[f.id] = f.version;
    }
    if (Object.keys(fragmentVersions).length > 0) {
      writtenVersions[result.target] = fragmentVersions;
    }

    if (existing === result.content) {
      log.dim(`  ${result.filePath} — no changes`);
      continue;
    }

    changesCount++;
    if (options.dryRun) {
      const oldLines = existing ? existing.split("\n").length : 0;
      const newLines = result.content.split("\n").length;
      log.info(`  ${result.filePath} — would update (${oldLines} → ${newLines} lines)`);
    } else {
      await writeFile(outputPath, result.content);
      log.success(`  ${result.filePath} — updated`);
    }
  }

  if (!options.dryRun) {
    // Update meta. Write-order note: generated files above are written
    // before `.aware.json` is saved here. Phase 1's drift engine doesn't
    // read `_meta.fileHashes` (it re-verifies from on-disk content) so a
    // concurrent `diff` between the two writes sees no inconsistency.
    // When Phase 4 starts consuming `_meta.fileHashes`, revisit: either
    // atomic-rename the config or tolerate a brief window where the map
    // trails the filesystem.
    config._meta.lastSyncedAt = new Date().toISOString();
    config._meta.lastDetectionHash = newHash;
    persistFileHashes(config, writtenHashes);
    persistFragmentVersions(config, writtenVersions);
    await saveConfig(projectRoot, config);
  }

  if (changesCount === 0) {
    log.success("All targets already in sync.");
  } else if (options.dryRun) {
    log.dim(`\nDry run complete. ${changesCount} file(s) would be updated.`);
  } else {
    log.success(`\n${changesCount} file(s) synced.`);
  }
}

function persistFileHashes(
  config: AwareConfig,
  hashes: Partial<Record<TargetName, string>>,
): void {
  if (!config._meta.fileHashes) config._meta.fileHashes = {};
  config._meta.fileHashes[ROOT_PACKAGE_KEY] = {
    ...config._meta.fileHashes[ROOT_PACKAGE_KEY],
    ...hashes,
  };
}

function persistFragmentVersions(
  config: AwareConfig,
  versions: Partial<Record<TargetName, Record<string, string>>>,
): void {
  if (Object.keys(versions).length === 0) return;
  if (!config._meta.fragmentVersions) config._meta.fragmentVersions = {};
  config._meta.fragmentVersions[ROOT_PACKAGE_KEY] = {
    ...config._meta.fragmentVersions[ROOT_PACKAGE_KEY],
    ...versions,
  };
}
