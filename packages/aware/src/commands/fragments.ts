import { detectStack } from "../detectors/index.js";
import { resolveFragments } from "../fragments/index.js";
import { loadPlugins } from "../plugins/loader.js";
import { loadConfig, saveConfig } from "../utils/config.js";
import { log } from "../utils/logger.js";

/**
 * Inspect and toggle fragment visibility without editing `.aware.json`
 * by hand. Disabled fragments are recorded in
 * `config.fragments.disabled: string[]`; the registry skips matching
 * ids at resolve time.
 *
 * Three subcommands:
 *   list             — show all fragments that apply to this project,
 *                      with their enabled/disabled state.
 *   disable <id>     — add `id` to the disabled list (idempotent).
 *   enable <id>      — remove `id` from the disabled list (idempotent).
 *
 * The scope of "all fragments that apply" is resolved through the
 * normal pipeline (plugin load → appliesTo gate → build). A fragment
 * disabled today can be re-enabled tomorrow even if it no longer
 * applies — the id persists in `disabled[]` as a latent preference.
 */

export async function fragmentsListCommand(): Promise<void> {
  const projectRoot = process.cwd();
  const config = await loadConfig(projectRoot);
  if (!config) {
    log.error("No .aware.json found. Run `aware init` first.");
    process.exit(1);
    return;
  }

  if (config.plugins && config.plugins.length > 0) {
    await loadPlugins({ projectRoot, pluginSpecifiers: config.plugins });
  }
  const stack = await detectStack(projectRoot);

  // Resolve with disables temporarily cleared so we can show disabled
  // fragments as "disabled" in the list instead of omitting them.
  const disabledIds = new Set(config.fragments?.disabled ?? []);
  const unfiltered = resolveFragments(stack, {
    ...config,
    fragments: { ...(config.fragments ?? {}), disabled: [] },
  });

  if (unfiltered.length === 0) {
    log.dim("No fragments apply to this project's stack.");
    // Monorepo UX hint: at the root the stack is minimal by design,
    // so this command would almost always be empty. Point the user
    // at the per-package invocation that actually shows something.
    if (config.packages && config.packages.length > 0) {
      log.dim(
        "This project looks like a monorepo root. Run `aware fragments list` " +
          "inside a package directory to see that package's fragments.",
      );
    }
    return;
  }

  log.header("Fragments (resolved for this project):");
  for (const fragment of unfiltered) {
    const marker = disabledIds.has(fragment.id)
      ? "  [disabled]"
      : "  [enabled] ";
    log.plain(
      `${marker} ${fragment.id.padEnd(36)} ${fragment.category}  ${fragment.title}`,
    );
  }
  log.plain("");
  log.dim(
    `${disabledIds.size} disabled, ${unfiltered.length - disabledIds.size} enabled. ` +
      `Toggle with \`aware fragments disable <id>\` / \`aware fragments enable <id>\`.`,
  );
}

export async function fragmentsDisableCommand(id: string): Promise<void> {
  const projectRoot = process.cwd();
  const config = await loadConfig(projectRoot);
  if (!config) {
    log.error("No .aware.json found. Run `aware init` first.");
    process.exit(1);
    return;
  }
  if (!id || id.length === 0) {
    log.error("Usage: aware fragments disable <id>");
    process.exit(1);
    return;
  }

  const disabled = [...(config.fragments?.disabled ?? [])];
  if (disabled.includes(id)) {
    log.info(`Fragment "${id}" is already disabled.`);
    return;
  }

  // Warn (don't fail) when the id doesn't match any currently-resolved
  // fragment. The disable is still saved — the plan treats unknown ids
  // as "latent preferences" that survive future stack changes — but a
  // user who typed the id wrong shouldn't silently wait until `sync`
  // to discover nothing happened.
  try {
    if (config.plugins && config.plugins.length > 0) {
      await loadPlugins({ projectRoot, pluginSpecifiers: config.plugins });
    }
    const stack = await detectStack(projectRoot);
    const current = resolveFragments(stack, {
      ...config,
      fragments: { ...(config.fragments ?? {}), disabled: [] },
    });
    if (!current.some((f) => f.id === id)) {
      log.warn(
        `No currently-resolved fragment has id "${id}" — saved as a latent ` +
          `preference. Double-check for a typo with \`aware fragments list\`.`,
      );
    }
  } catch {
    // Detection may fail on a malformed project; don't let that block
    // the write.
  }

  disabled.push(id);
  config.fragments = { ...(config.fragments ?? {}), disabled };
  await saveConfig(projectRoot, config);
  log.success(`Disabled fragment "${id}".`);
  log.dim("Run `aware sync` to regenerate context files.");
}

export async function fragmentsEnableCommand(id: string): Promise<void> {
  const projectRoot = process.cwd();
  const config = await loadConfig(projectRoot);
  if (!config) {
    log.error("No .aware.json found. Run `aware init` first.");
    process.exit(1);
  }
  if (!id || id.length === 0) {
    log.error("Usage: aware fragments enable <id>");
    process.exit(1);
  }

  const disabled = (config.fragments?.disabled ?? []).filter((d) => d !== id);
  if (disabled.length === (config.fragments?.disabled?.length ?? 0)) {
    log.info(`Fragment "${id}" was not disabled.`);
    return;
  }
  config.fragments = { ...(config.fragments ?? {}), disabled };
  // Collapse an empty disabled array back to `undefined` to keep the
  // config file tidy.
  if (config.fragments.disabled && config.fragments.disabled.length === 0) {
    delete config.fragments.disabled;
    if (Object.keys(config.fragments).length === 0) {
      delete config.fragments;
    }
  }
  await saveConfig(projectRoot, config);
  log.success(`Enabled fragment "${id}".`);
  log.dim("Run `aware sync` to regenerate context files.");
}
