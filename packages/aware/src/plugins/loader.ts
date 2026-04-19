import * as path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { registerFragmentModule } from "../fragments/index.js";
import { log } from "../utils/logger.js";
import type { FragmentModule } from "../types.js";
import type { Plugin } from "./api.js";

/**
 * Load the plugins declared in a project's `.aware.json#plugins` array
 * and register their contributions with the shared registries.
 *
 * Resolution rules per specifier:
 *   1. Relative path (`./foo`, `../foo`) or absolute path — resolve
 *      against `projectRoot`, import as a file URL.
 *   2. Bare npm specifier (`aware-plugin-acme`) — resolve via
 *      `createRequire` rooted at the user's `projectRoot/package.json`
 *      so we find the plugin in the USER'S node_modules, not aware's
 *      own. Without this, a globally-installed aware CLI can't
 *      discover project-scoped plugins.
 *
 * Idempotency: keyed by RESOLVED path/URL rather than the plugin's
 * self-declared `name`. This closes the impersonation hole where a
 * plugin could set `name: "aware-plugin-official"` to preempt the real
 * one's dedupe slot. A plugin's name is still validated (non-empty
 * string) but isn't trusted for identity.
 *
 * Failure isolation: one broken plugin — unresolvable module, bad
 * shape, throwing fragment — is caught and surfaced in the returned
 * `failed` array; other plugins still load. Failed plugins aren't
 * added to the resolved-specifier set, so fixing them and re-running
 * picks them up without a process restart.
 */

export interface LoadPluginsOptions {
  projectRoot: string;
  pluginSpecifiers: string[];
}

export interface LoadedPlugin {
  /** Specifier the caller passed in (as-written in `.aware.json`). */
  specifier: string;
  /** Fully-resolved path/URL we actually imported from. */
  resolved: string;
  plugin: Plugin;
  fragmentsRegistered: number;
}

export type PluginFailureCode =
  | "resolve-failed"
  | "import-failed"
  | "bad-shape"
  | "fragment-registration-failed";

export interface PluginFailure {
  specifier: string;
  code: PluginFailureCode;
  message: string;
  cause?: unknown;
}

export interface LoadPluginsResult {
  loaded: LoadedPlugin[];
  /** Specifiers that failed to load, with structured failure info. */
  failed: PluginFailure[];
}

/**
 * Resolved plugin URLs/paths that have already been loaded in this
 * process. Used to skip re-registration when the same plugin is
 * requested twice (e.g. sync loop, monorepo iteration).
 */
const loadedResolved = new Set<string>();

export async function loadPlugins(
  options: LoadPluginsOptions,
): Promise<LoadPluginsResult> {
  const result: LoadPluginsResult = { loaded: [], failed: [] };

  // Warn on duplicate specifiers in the input — almost always a typo.
  const seenSpecifiers = new Set<string>();
  const specs: string[] = [];
  for (const s of options.pluginSpecifiers) {
    if (seenSpecifiers.has(s)) {
      log.warn(`Plugin "${s}" appears twice in plugins[]; second entry ignored.`);
      continue;
    }
    seenSpecifiers.add(s);
    specs.push(s);
  }

  for (const spec of specs) {
    let resolved: string;
    try {
      resolved = resolveSpecifier(spec, options.projectRoot);
    } catch (err) {
      const failure: PluginFailure = {
        specifier: spec,
        code: "resolve-failed",
        message: (err as Error).message,
        cause: err,
      };
      result.failed.push(failure);
      log.warn(`Plugin "${spec}" could not be resolved: ${failure.message}`);
      continue;
    }

    // Dedupe by resolved path/URL so a rogue plugin can't impersonate
    // another by self-declaring the same `name`.
    if (loadedResolved.has(resolved)) {
      // Already loaded earlier in this process — skip without noise.
      continue;
    }

    let plugin: Plugin;
    try {
      plugin = await importPlugin(resolved, spec);
    } catch (err) {
      const code: PluginFailureCode = isImportErr(err)
        ? "import-failed"
        : "bad-shape";
      result.failed.push({
        specifier: spec,
        code,
        message: (err as Error).message,
        cause: err,
      });
      log.warn(`Plugin "${spec}" failed to load: ${(err as Error).message}`);
      continue;
    }

    // Dedupe key is the resolved specifier — NOT the plugin's
    // self-declared name (which would let a rogue plugin impersonate
    // a legitimate one). Registered on import success regardless of
    // per-fragment registration outcome: Node's module cache serves
    // the same module on any re-import, so retrying without a process
    // restart can't surface new behavior. Operators who want to retry
    // a plugin after editing it must restart the CLI anyway.
    loadedResolved.add(resolved);

    const registration = registerPluginFragments(plugin);
    if (registration.failures.length > 0) {
      result.failed.push(
        ...registration.failures.map((f) => ({
          specifier: spec,
          code: "fragment-registration-failed" as const,
          message: f,
        })),
      );
    }
    warnUnsupportedHooks(plugin);

    result.loaded.push({
      specifier: spec,
      resolved,
      plugin,
      fragmentsRegistered: registration.registeredCount,
    });
  }

  return result;
}

/**
 * Reset the resolved-plugin bookkeeping. Tests call this between
 * fixtures so `loadPlugins` starts fresh. Production code can use it
 * to implement hot-reload in `aware watch` (not wired yet).
 */
export function resetLoadedPlugins(): void {
  loadedResolved.clear();
}

function resolveSpecifier(specifier: string, projectRoot: string): string {
  // Local path: resolve against projectRoot, convert to file:// URL so
  // Node's ESM loader accepts it cross-platform.
  if (
    specifier.startsWith("./") ||
    specifier.startsWith("../") ||
    path.isAbsolute(specifier)
  ) {
    const abs = path.isAbsolute(specifier)
      ? specifier
      : path.resolve(projectRoot, specifier);
    return pathToFileURL(abs).href;
  }

  // Bare npm specifier. When aware is installed globally, `import()` in
  // the CLI's own module would resolve from aware's node_modules — NOT
  // the user's project. createRequire rooted at the project fixes this.
  const req = createRequire(path.join(projectRoot, "package.json"));
  try {
    const abs = req.resolve(specifier);
    return pathToFileURL(abs).href;
  } catch (err) {
    if (
      specifier.endsWith(".ts") ||
      specifier.endsWith(".tsx")
    ) {
      throw new Error(
        `Cannot load TypeScript plugin "${specifier}" directly — compile it to JS first ` +
          `(or use a TS-aware runtime like tsx). Original error: ${(err as Error).message}`,
      );
    }
    throw new Error(
      `Cannot resolve plugin "${specifier}" from ${projectRoot}. Is it installed?`,
    );
  }
}

async function importPlugin(resolved: string, specifier: string): Promise<Plugin> {
  const mod = (await import(resolved)) as {
    default?: Plugin;
    plugin?: Plugin;
  };
  const plugin = mod.default ?? mod.plugin;
  if (!plugin || typeof plugin !== "object") {
    throw new Error(
      `plugin "${specifier}" has no default export (or named \`plugin\` export) returning a Plugin object`,
    );
  }
  if (typeof plugin.name !== "string" || plugin.name.length === 0) {
    throw new Error(`plugin "${specifier}" is missing the required \`name\` field`);
  }
  return plugin;
}

function registerPluginFragments(plugin: Plugin): {
  registeredCount: number;
  failures: string[];
} {
  if (!plugin.fragments || plugin.fragments.length === 0) {
    return { registeredCount: 0, failures: [] };
  }
  let registeredCount = 0;
  const failures: string[] = [];
  for (const fragment of plugin.fragments) {
    try {
      assertValidFragmentModule(fragment, plugin.name);
      registerFragmentModule(fragment);
      registeredCount++;
    } catch (err) {
      const msg =
        `plugin "${plugin.name}" fragment "${fragment.id ?? "?"}" failed ` +
        `to register: ${(err as Error).message}`;
      log.warn(msg);
      failures.push(msg);
    }
  }
  return { registeredCount, failures };
}

function assertValidFragmentModule(
  fragment: FragmentModule,
  pluginName: string,
): void {
  if (typeof fragment.id !== "string" || fragment.id.length === 0) {
    throw new Error(
      `plugin "${pluginName}" contributed a fragment with no \`id\``,
    );
  }
  if (typeof fragment.build !== "function") {
    throw new Error(
      `plugin "${pluginName}" fragment "${fragment.id}" has no \`build\` function`,
    );
  }
}

function warnUnsupportedHooks(plugin: Plugin): void {
  const unknownPlugin = plugin as Plugin & {
    detectors?: unknown[];
    generators?: unknown[];
  };
  if (unknownPlugin.detectors && unknownPlugin.detectors.length > 0) {
    log.warn(
      `Plugin "${plugin.name}" declares detectors but Phase 5 doesn't wire them yet. Ignored.`,
    );
  }
  if (unknownPlugin.generators && unknownPlugin.generators.length > 0) {
    log.warn(
      `Plugin "${plugin.name}" declares generators but Phase 5 doesn't wire them yet. Ignored.`,
    );
  }
}

function isImportErr(err: unknown): boolean {
  const code = (err as { code?: string }).code;
  return (
    code === "ERR_MODULE_NOT_FOUND" ||
    code === "MODULE_NOT_FOUND" ||
    code === "ERR_INVALID_MODULE_SPECIFIER"
  );
}
