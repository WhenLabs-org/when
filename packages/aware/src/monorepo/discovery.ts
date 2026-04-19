import * as path from "node:path";
import * as yaml from "js-yaml";
import fg from "fast-glob";
import { fileExists, readFile } from "../utils/fs.js";
import { parsePackageJson } from "../utils/parsers.js";

/**
 * Resolve a monorepo's workspace package list from whichever declaration
 * the project uses. Returns relative paths (from the repo root) so that
 * downstream callers (`.aware.json._meta.fileHashes`, per-package
 * `packagePath`) have a stable, OS-agnostic key.
 *
 * Supported sources, in priority order:
 *   1. `pnpm-workspace.yaml` — pnpm-native.
 *   2. `package.json#workspaces` — npm/yarn/bun convention. Also what
 *      Turborepo and Nx use as the authoritative list.
 *   3. `lerna.json#packages` — historical.
 *
 * `turbo.json` and `nx.json` don't declare packages themselves; they
 * rely on whichever workspace manager is present. We therefore don't
 * parse them for discovery.
 */

export interface DiscoveredPackage {
  /** Path relative to the monorepo root, with forward slashes. */
  relativePath: string;
  /** Absolute path on disk. */
  absolutePath: string;
  /** The package.json `name` field, if present. */
  name: string | null;
}

export interface WorkspaceDiscovery {
  /** True when we found at least one workspace-declaration file. */
  isMonorepo: boolean;
  /** Resolved member packages (deduplicated, sorted by relative path). */
  packages: DiscoveredPackage[];
  /** Glob patterns declared by the project (preserved for `.aware.json.packages`). */
  patterns: string[];
  /** Where the patterns came from, for error messages / doctor output. */
  source: "pnpm-workspace.yaml" | "package.json" | "lerna.json" | null;
}

export async function discoverWorkspace(
  projectRoot: string,
): Promise<WorkspaceDiscovery> {
  const empty: WorkspaceDiscovery = {
    isMonorepo: false,
    packages: [],
    patterns: [],
    source: null,
  };

  // 1. pnpm-workspace.yaml
  const pnpm = await readPnpmWorkspacePatterns(projectRoot);
  if (pnpm.length > 0) {
    return resolvePackages(projectRoot, pnpm, "pnpm-workspace.yaml");
  }

  // 2. package.json#workspaces
  const pkg = await parsePackageJson(projectRoot);
  const npmPatterns = readPackageJsonWorkspaces(pkg);
  if (npmPatterns.length > 0) {
    return resolvePackages(projectRoot, npmPatterns, "package.json");
  }

  // 3. lerna.json
  const lerna = await readLernaPatterns(projectRoot);
  if (lerna.length > 0) {
    return resolvePackages(projectRoot, lerna, "lerna.json");
  }

  return empty;
}

async function readPnpmWorkspacePatterns(projectRoot: string): Promise<string[]> {
  const content = await readFile(path.join(projectRoot, "pnpm-workspace.yaml"));
  if (!content) return [];
  try {
    const parsed = yaml.load(content) as
      | { packages?: string[] }
      | null
      | undefined;
    return Array.isArray(parsed?.packages) ? parsed!.packages : [];
  } catch {
    return [];
  }
}

function readPackageJsonWorkspaces(
  pkg: { workspaces?: string[] | { packages: string[] } } | null,
): string[] {
  if (!pkg?.workspaces) return [];
  if (Array.isArray(pkg.workspaces)) return pkg.workspaces;
  if (Array.isArray(pkg.workspaces.packages)) return pkg.workspaces.packages;
  return [];
}

async function readLernaPatterns(projectRoot: string): Promise<string[]> {
  const content = await readFile(path.join(projectRoot, "lerna.json"));
  if (!content) return [];
  try {
    const parsed = JSON.parse(content) as { packages?: string[] };
    return Array.isArray(parsed.packages) ? parsed.packages : [];
  } catch {
    return [];
  }
}

/**
 * Expand workspace glob patterns into concrete package directories.
 * A directory is a package iff it contains a `package.json`. We resolve
 * with fast-glob's `onlyDirectories: true`, then verify each candidate.
 *
 * Deduplicated (a directory matching multiple patterns is reported
 * once) and sorted for deterministic output.
 */
async function resolvePackages(
  projectRoot: string,
  patterns: string[],
  source: "pnpm-workspace.yaml" | "package.json" | "lerna.json",
): Promise<WorkspaceDiscovery> {
  // Split pnpm-style negation patterns (`!apps/legacy`) into fast-glob's
  // `ignore` option. fast-glob honors inline `!` too, but being
  // explicit about where negations live avoids edge cases where a
  // positive pattern follows a negation.
  const positive: string[] = [];
  const negative: string[] = ["**/node_modules/**"];
  for (const p of patterns) {
    if (p.startsWith("!")) negative.push(p.slice(1));
    else positive.push(p);
  }

  const dirs = await fg(positive, {
    cwd: projectRoot,
    onlyDirectories: true,
    dot: false,
    ignore: negative,
  });

  const byRelative = new Map<string, DiscoveredPackage>();
  for (const dir of dirs) {
    const normalized = normalizeSep(dir);
    if (byRelative.has(normalized)) continue;
    const abs = path.join(projectRoot, normalized);
    if (!(await fileExists(path.join(abs, "package.json")))) continue;
    const pkg = await parsePackageJson(abs);
    byRelative.set(normalized, {
      relativePath: normalized,
      absolutePath: abs,
      name: pkg?.name ?? null,
    });
  }

  const packages = [...byRelative.values()].sort((a, b) =>
    a.relativePath.localeCompare(b.relativePath),
  );

  return {
    isMonorepo: packages.length > 0,
    packages,
    patterns,
    source,
  };
}

function normalizeSep(p: string): string {
  return p.split(path.sep).join("/");
}
