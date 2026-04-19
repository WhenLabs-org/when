import * as path from "node:path";
import * as fs from "node:fs/promises";
import { loadConfigWithMeta } from "../utils/config.js";
import type { AwareConfig } from "../types.js";

/**
 * Resolve a per-package `.aware.json` into an effective config by
 * following its `extends` chain up to the monorepo root.
 *
 * A package config like:
 *
 *   {
 *     "version": 2,
 *     "extends": "../../.aware.json",
 *     "project": { "name": "@acme/web" },
 *     "stack": { "framework": "nextjs@15:app-router" }
 *   }
 *
 * inherits `rules`, `conventions`, and `targets` from the root, while
 * overriding `project` and `stack` locally. Packages that don't set
 * `extends` are standalone — their config is used as-is.
 *
 * Cycle detection: the chain is bounded at 8 levels (arbitrary but
 * generous), and we also track visited absolute paths so a symlinked
 * loop can't hang the resolver.
 */

const MAX_EXTENDS_DEPTH = 8;

export interface ResolvedPackageConfig {
  /** The effective, fully-merged config. */
  config: AwareConfig;
  /** Directory (absolute) that owned the leaf config. */
  packageRoot: string;
  /**
   * The chain of config files that contributed, in merge order
   * (root → ... → leaf). Kept for debugging and for `doctor` to show
   * "this package inherits from X".
   */
  chain: string[];
}

export async function resolvePackageConfig(
  packageRoot: string,
): Promise<ResolvedPackageConfig | null> {
  const visited = new Set<string>();
  const chain: string[] = [];
  const stack: Array<{ config: AwareConfig; dir: string }> = [];

  let currentDir = packageRoot;
  for (let depth = 0; depth < MAX_EXTENDS_DEPTH; depth++) {
    const absDir = path.resolve(currentDir);
    if (visited.has(absDir)) {
      throw new Error(
        `Cycle in .aware.json \`extends\` chain at ${absDir}. ` +
          `Chain: ${[...chain, absDir].join(" -> ")}`,
      );
    }
    visited.add(absDir);

    const loaded = await loadConfigWithMeta(absDir);
    if (!loaded) break;

    chain.push(path.join(absDir, ".aware.json"));
    stack.push({ config: loaded.config, dir: absDir });

    const ext = loaded.config.extends;
    if (!ext) break;

    // Resolve `extends` relative to the current config's directory.
    // Accept both a directory path (points to the parent config's dir)
    // and a file path (explicit `.aware.json` ref). Directory form is
    // preferred because it matches how tsconfig `extends` works.
    //
    // We stat the target to know which form we got — the suffix alone
    // isn't reliable (e.g. `extends: "../packages/core"` on a directory
    // named "core" shouldn't be dirname'd).
    const extResolved = path.resolve(absDir, ext);
    currentDir = (await resolvesToFile(extResolved))
      ? path.dirname(extResolved)
      : extResolved;
  }

  if (stack.length === 0) return null;

  // Merge root → ... → leaf so leaf wins on overlap. `stack` is in
  // leaf-first order (walking up from the package); reverse to
  // root-first so reduce applies parents before children.
  const ordered = [...stack].reverse();
  const [first, ...rest] = ordered;
  const merged = rest.reduce(
    (acc, { config }) => mergeConfigs(acc, config),
    first!.config,
  );

  return {
    config: merged,
    packageRoot: path.resolve(packageRoot),
    chain,
  };
}

/**
 * Does `p` refer to an existing regular file? Used to distinguish
 * `extends: "../../.aware.json"` (file form) from `extends: "../../"`
 * (directory form). We can't rely on suffix alone because user
 * directory names may contain dots.
 */
async function resolvesToFile(p: string): Promise<boolean> {
  try {
    const stat = await fs.stat(p);
    return stat.isFile();
  } catch {
    return false;
  }
}

/**
 * Shallow-merge two AwareConfigs: leaf wins on top-level keys, with
 * object fields (`project`, `stack`, `conventions`, `targets`)
 * shallow-merged one level deep. Rules arrays concatenate (root first,
 * then leaf). Structure merges with leaf winning on path collisions.
 *
 * `_meta` is taken wholesale from the leaf (falls back to base when
 * leaf has none). Merging root's `_meta` into a leaf would bleed
 * root-level `fileHashes` / `lastSyncedAt` / `fragmentVersions` into
 * the leaf's resolved config — which Phase 1 drift detection would
 * then read as "this package's last sync state", leading to false
 * tamper verdicts.
 *
 * `fragments.disabled` unions across the chain: a root-level disable
 * of "foo" applies to every package that extends the root, in addition
 * to any per-package disables. Phase 6 added this; the default
 * top-level spread would otherwise have leaf.fragments silently
 * shadow root.fragments, breaking the intended semantics of
 * "suppress this rule everywhere in the monorepo."
 */
function mergeConfigs(base: AwareConfig, leaf: AwareConfig): AwareConfig {
  return {
    ...base,
    ...leaf,
    project: { ...base.project, ...leaf.project },
    stack: { ...base.stack, ...leaf.stack },
    conventions: { ...base.conventions, ...leaf.conventions },
    targets: { ...base.targets, ...leaf.targets },
    rules: [...(base.rules ?? []), ...(leaf.rules ?? [])],
    structure: { ...base.structure, ...leaf.structure },
    fragments: mergeFragments(base.fragments, leaf.fragments),
    _meta: leaf._meta ?? base._meta,
  };
}

function mergeFragments(
  base: AwareConfig["fragments"],
  leaf: AwareConfig["fragments"],
): AwareConfig["fragments"] {
  if (!base && !leaf) return undefined;
  const mergedDisabled = Array.from(
    new Set([...(base?.disabled ?? []), ...(leaf?.disabled ?? [])]),
  );
  const result: NonNullable<AwareConfig["fragments"]> = {};
  if (mergedDisabled.length > 0) result.disabled = mergedDisabled;
  return Object.keys(result).length > 0 ? result : undefined;
}
