import { loadConfig, saveConfig } from "../utils/config.js";
import { log } from "../utils/logger.js";
import type { AwareConfig } from "../types.js";

export interface RemoveOptions {
  /** What kind of entry to remove: rule | structure | convention | plugin. */
  type: string;
  /**
   * For list-valued types (rule, plugin): remove the entry at this
   * 0-based index. Integer string; parsed at command time.
   */
  index?: string;
  /**
   * For map-valued types (structure by path; convention by
   * "category.key"; plugin by specifier): identify the entry to remove
   * by its natural key.
   */
  id?: string;
}

/**
 * Counterpart to `aware add`. Deliberately flat — no TUI dependency —
 * so scripts can call it the same way they call `add`. Every removal
 * requires either `--index` or `--id`; we never delete by fuzzy match
 * because silent deletion of the wrong entry is worse than a clear
 * "specify one" error.
 *
 * Each per-type helper returns `true` on success, `false` when it
 * errored (via `log.error` + `process.exit(1)`). The outer command
 * uses that signal to decide whether to save — crucial so that a
 * mocked `process.exit` in tests doesn't fall through and save
 * unchanged config.
 */
export async function removeCommand(options: RemoveOptions): Promise<void> {
  const projectRoot = process.cwd();

  const config = await loadConfig(projectRoot);
  if (!config) {
    log.error("No .aware.json found. Run `aware init` first.");
    process.exit(1);
    return;
  }

  let ok: boolean;
  switch (options.type) {
    case "rule":
      ok = removeRule(config, options);
      break;
    case "structure":
      ok = removeStructure(config, options);
      break;
    case "convention":
      ok = removeConvention(config, options);
      break;
    case "plugin":
      ok = removePlugin(config, options);
      break;
    default:
      log.error(
        `Unknown type: ${options.type}. Use: rule, structure, convention, plugin`,
      );
      process.exit(1);
      return;
  }

  if (!ok) return;

  await saveConfig(projectRoot, config);
  log.dim("Run `aware sync` to regenerate context files.");
}

function removeRule(config: AwareConfig, opts: RemoveOptions): boolean {
  if (opts.index === undefined) {
    log.error("Missing --index. `aware remove --type rule --index <n>`.");
    process.exit(1);
    return false;
  }
  const idx = parseIndex(opts.index, config.rules.length);
  if (idx === null) return false;
  const [removed] = config.rules.splice(idx, 1);
  log.success(`Rule removed: "${removed}" (${config.rules.length} remain)`);
  return true;
}

function removeStructure(config: AwareConfig, opts: RemoveOptions): boolean {
  if (!opts.id) {
    log.error("Missing --id. `aware remove --type structure --id <path>`.");
    process.exit(1);
    return false;
  }
  if (!(opts.id in config.structure)) {
    log.error(`No structure entry for "${opts.id}".`);
    process.exit(1);
    return false;
  }
  delete config.structure[opts.id];
  log.success(`Structure entry removed: ${opts.id}`);
  return true;
}

function removeConvention(config: AwareConfig, opts: RemoveOptions): boolean {
  if (!opts.id) {
    log.error(
      "Missing --id. `aware remove --type convention --id category.key` " +
        "(nested: `aware remove --type convention --id naming.components.case`).",
    );
    process.exit(1);
    return false;
  }
  // Support arbitrarily-nested paths — `naming.components.case` deletes
  // `conventions.naming.components.case`. The previous implementation
  // split on the first dot and silently removed the wrong leaf.
  const segments = opts.id.split(".").filter((s) => s.length > 0);
  if (segments.length < 2) {
    log.error(
      "--id must have the form `category.key` (at least two dot-separated " +
        "segments). Got " + JSON.stringify(opts.id) + ".",
    );
    process.exit(1);
    return false;
  }

  // Walk to the parent container, then delete the final segment.
  let cursor: Record<string, unknown> = config.conventions as unknown as Record<
    string,
    unknown
  >;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i]!;
    const next = cursor[seg];
    if (!next || typeof next !== "object" || Array.isArray(next)) {
      log.error(
        `No convention entry at "${opts.id}" (path stops at "${segments
          .slice(0, i + 1)
          .join(".")}").`,
      );
      process.exit(1);
      return false;
    }
    cursor = next as Record<string, unknown>;
  }

  const lastSeg = segments[segments.length - 1]!;
  if (!(lastSeg in cursor)) {
    log.error(`No convention entry at "${opts.id}".`);
    process.exit(1);
    return false;
  }
  delete cursor[lastSeg];
  log.success(`Convention removed: ${opts.id}`);
  return true;
}

function removePlugin(config: AwareConfig, opts: RemoveOptions): boolean {
  const plugins = config.plugins ?? [];
  if (plugins.length === 0) {
    log.error("No plugins declared in .aware.json.");
    process.exit(1);
    return false;
  }

  // Support both --id (specifier) and --index for plugins, since users
  // may know the npm name OR just want to drop the last one they added.
  let idx: number;
  if (opts.index !== undefined) {
    const parsed = parseIndex(opts.index, plugins.length);
    if (parsed === null) return false;
    idx = parsed;
  } else if (opts.id) {
    idx = plugins.indexOf(opts.id);
    if (idx === -1) {
      log.error(`No plugin matching "${opts.id}".`);
      process.exit(1);
      return false;
    }
  } else {
    log.error(
      "Missing --id or --index. `aware remove --type plugin --id <specifier>`.",
    );
    process.exit(1);
    return false;
  }

  const [removed] = plugins.splice(idx, 1);
  config.plugins = plugins.length > 0 ? plugins : undefined;
  log.success(`Plugin removed: ${removed}`);
  return true;
}

/**
 * Parse an index argument or error out. Returns null (never an
 * invalid number) so callers can short-circuit without needing to
 * catch — pair with the boolean success convention in each helper.
 */
function parseIndex(raw: string, length: number): number | null {
  const n = parseInt(raw, 10);
  if (!Number.isInteger(n) || n < 0 || n >= length) {
    log.error(`--index must be an integer in [0, ${length - 1}]. Got "${raw}".`);
    process.exit(1);
    return null;
  }
  return n;
}
