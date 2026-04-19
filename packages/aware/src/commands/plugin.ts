import { loadConfig, saveConfig } from "../utils/config.js";
import { loadPlugins, resetLoadedPlugins } from "../plugins/loader.js";
import { log } from "../utils/logger.js";

/**
 * Manage the `plugins: string[]` array in `.aware.json` without
 * hand-editing the file. The user is still responsible for
 * installing the plugin's npm package (`pnpm add -D aware-plugin-foo`)
 * — these commands only update the config so `aware sync` knows to
 * load it.
 *
 * This is deliberately more limited than what the roadmap sketched
 * (`aware add @acme/plugin` running `pnpm install` itself). Package-
 * manager invocation lives in `install-hooks` territory and is easy to
 * get wrong across pnpm/npm/yarn/bun — we'd rather leave it to the
 * user than install the wrong way.
 */

export async function pluginAddCommand(specifier: string): Promise<void> {
  const projectRoot = process.cwd();
  const config = await loadConfig(projectRoot);
  if (!config) {
    log.error("No .aware.json found. Run `aware init` first.");
    process.exit(1);
  }
  if (!specifier || specifier.length === 0) {
    log.error("Usage: aware plugin add <specifier>");
    process.exit(1);
  }

  const plugins = [...(config.plugins ?? [])];
  if (plugins.includes(specifier)) {
    log.info(`Plugin "${specifier}" is already declared.`);
    return;
  }
  plugins.push(specifier);
  config.plugins = plugins;
  await saveConfig(projectRoot, config);
  log.success(`Added plugin "${specifier}".`);
  log.dim(
    `Install the package if you haven't already (e.g. \`pnpm add -D ${specifier}\`), then run \`aware sync\`.`,
  );
}

export async function pluginRemoveCommand(specifier: string): Promise<void> {
  const projectRoot = process.cwd();
  const config = await loadConfig(projectRoot);
  if (!config) {
    log.error("No .aware.json found. Run `aware init` first.");
    process.exit(1);
  }
  if (!specifier || specifier.length === 0) {
    log.error("Usage: aware plugin remove <specifier>");
    process.exit(1);
  }

  const plugins = config.plugins ?? [];
  const idx = plugins.indexOf(specifier);
  if (idx === -1) {
    log.error(`No plugin matching "${specifier}".`);
    process.exit(1);
  }
  plugins.splice(idx, 1);
  config.plugins = plugins.length > 0 ? plugins : undefined;
  await saveConfig(projectRoot, config);
  log.success(`Removed plugin "${specifier}".`);
  log.dim("Run `aware sync` to regenerate context files.");
}

export async function pluginListCommand(): Promise<void> {
  const projectRoot = process.cwd();
  const config = await loadConfig(projectRoot);
  if (!config) {
    log.error("No .aware.json found. Run `aware init` first.");
    process.exit(1);
    return;
  }
  const plugins = config.plugins ?? [];
  if (plugins.length === 0) {
    log.dim("No plugins declared.");
    return;
  }

  // Actually try to load each plugin so the user sees whether it
  // resolves, imports, and shapes correctly — vs. just dumping the
  // raw list. Reset first so the status reflects THIS invocation,
  // not whatever state accumulated from a prior scan in the same
  // process. We don't register the fragments into any live pipeline
  // here; the goal is just the per-plugin health check.
  resetLoadedPlugins();
  const result = await loadPlugins({
    projectRoot,
    pluginSpecifiers: plugins,
  });

  log.header("Declared plugins:");
  for (const spec of plugins) {
    const loaded = result.loaded.find((l) => l.specifier === spec);
    const failure = result.failed.find((f) => f.specifier === spec);
    if (loaded) {
      log.plain(
        `  ✓ ${spec}` +
          (loaded.plugin.version ? ` (v${loaded.plugin.version})` : "") +
          ` — ${loaded.fragmentsRegistered} fragment(s)`,
      );
    } else if (failure) {
      log.plain(`  ✗ ${spec} — ${failure.code}: ${failure.message}`);
    } else {
      log.plain(`  ? ${spec} — (unknown state)`);
    }
  }
}
