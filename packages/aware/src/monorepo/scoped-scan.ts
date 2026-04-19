import * as path from "node:path";
import { scan, type ScanOptions, type ScanOutput } from "../scan.js";
import { createDefaultConfig } from "../utils/config.js";
import { parsePackageJson } from "../utils/parsers.js";
import { discoverWorkspace, type DiscoveredPackage } from "./discovery.js";
import type { StackConfig, TargetsConfig } from "../types.js";

/**
 * Run `scan()` once per workspace package in a monorepo. Each package
 * is treated as its own project root — detectors, extractors, and
 * generators all run scoped to the package directory. The returned
 * `ScanOutput[]` lets callers iterate and generate per-package context
 * files without having to re-implement the orchestration.
 *
 * Non-monorepo projects return a single-element array (the root scan)
 * so callers can branch-lessly iterate.
 */

export interface MonorepoScanResult {
  /** Per-package scan outputs. */
  packages: Array<{
    pkg: DiscoveredPackage;
    result: ScanOutput;
  }>;
  /** The scan of the monorepo root itself (for shared root-level config). */
  root: ScanOutput;
  /** Discovered workspace metadata. */
  workspace: Awaited<ReturnType<typeof discoverWorkspace>>;
}

export async function scanMonorepo(
  projectRoot: string,
  options: Omit<ScanOptions, "projectRoot"> = {},
): Promise<MonorepoScanResult> {
  const workspace = await discoverWorkspace(projectRoot);

  if (!workspace.isMonorepo) {
    // Not a monorepo: the root IS the project. Full scan.
    const root = await scan({ ...options, projectRoot });
    return { root, packages: [], workspace };
  }

  // Monorepo: the root is a container, not a project. Skip the full
  // scan (which would walk every package subtree — double-work AND
  // mixed-signal stack from aggregating across packages). Produce a
  // minimal root scan instead: project name from package.json, empty
  // stack, empty conventions. Packages inherit via `extends`, so
  // nothing downstream reads the root's stack anyway.
  const root = await buildMinimalRootScan(projectRoot, options.targets);

  // Scan packages in parallel, bounded to avoid saturating IO on large
  // monorepos (100+ packages is realistic). Concurrency of 8 is a
  // reasonable default — tighter than unlimited, looser than serial.
  // Per-worker errors are captured so one broken package can't tank the
  // whole scan.
  const packageResults = await withBoundedConcurrency(
    workspace.packages,
    8,
    async (pkg) => {
      const result = await scan({ ...options, projectRoot: pkg.absolutePath });
      return { pkg, result };
    },
  );

  return { root, packages: packageResults, workspace };
}

async function buildMinimalRootScan(
  projectRoot: string,
  targets?: TargetsConfig,
): Promise<ScanOutput> {
  const pkg = await parsePackageJson(projectRoot);
  const projectName = pkg?.name ?? path.basename(projectRoot);
  const emptyStack: StackConfig = {
    framework: null,
    language: null,
    styling: null,
    orm: null,
    database: null,
    testing: [],
    linting: [],
    packageManager: null,
    monorepo: null,
    deployment: null,
    auth: null,
    apiStyle: null,
    stateManagement: null,
    cicd: null,
    bundler: null,
  };
  const effectiveTargets: TargetsConfig = targets ?? {
    claude: true,
    cursor: true,
    copilot: true,
    agents: true,
  };
  const config = createDefaultConfig(projectName, emptyStack, effectiveTargets);
  if (pkg?.description) config.project.description = pkg.description;

  return {
    projectRoot,
    projectName,
    stack: {
      framework: null,
      language: null,
      styling: null,
      orm: null,
      database: null,
      testing: [],
      linting: [],
      packageManager: null,
      monorepo: null,
      deployment: null,
      auth: null,
      apiStyle: null,
      stateManagement: null,
      cicd: null,
      bundler: null,
    },
    stackConfig: emptyStack,
    config,
    fragments: [],
    generatedFiles: [],
  };
}

/**
 * Cap the number of in-flight promises. Per-worker exceptions are
 * caught and logged rather than rejecting the whole batch — one
 * malformed package.json in a 50-package monorepo shouldn't tank every
 * other scan. Failed items are simply omitted from the results
 * (scanMonorepo's callers already know to expect fewer entries than
 * `workspace.packages.length` when something goes wrong).
 */
async function withBoundedConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: Array<R | undefined> = new Array(items.length);
  let next = 0;
  const runners = new Array(Math.min(limit, items.length))
    .fill(null)
    .map(async () => {
      while (true) {
        const idx = next++;
        if (idx >= items.length) break;
        try {
          results[idx] = await worker(items[idx]!);
        } catch (err) {
          // Surface via stderr so CI / doctor can see it; don't rethrow.
          // eslint-disable-next-line no-console
          console.error(
            `[aware] scanMonorepo: item ${idx} failed — ${(err as Error).message}`,
          );
          results[idx] = undefined;
        }
      }
    });
  await Promise.all(runners);
  return results.filter((r): r is R => r !== undefined);
}

/**
 * Compute the `extends` path a package config should use to reach the
 * monorepo root. Returns a POSIX-style relative path because
 * `.aware.json` is meant to be committed to git and must be
 * OS-agnostic.
 *
 * Throws if called with `packageAbsPath === monorepoRoot` — a package
 * that is itself the monorepo root can't `extends` itself, and the
 * caller almost certainly meant something else (e.g. forgot to filter
 * the root out of the package list).
 */
export function computeExtendsPath(
  monorepoRoot: string,
  packageAbsPath: string,
): string {
  const rel = path.relative(packageAbsPath, monorepoRoot);
  if (rel === "") {
    throw new Error(
      `computeExtendsPath: package path equals the monorepo root (${monorepoRoot}). ` +
        `A package cannot \`extends\` itself.`,
    );
  }
  return rel.split(path.sep).join("/") + "/.aware.json";
}
