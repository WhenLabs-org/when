import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';

export interface WorkspaceInfo {
  /** Name from the workspace's package.json (or directory basename as fallback). */
  name: string;
  /** Absolute path to the workspace directory. */
  path: string;
  /** Direct dep names (prod + dev + peer + optional) declared by this workspace. */
  directDependencies: string[];
}

type WorkspacesField = string[] | { packages?: string[] } | undefined;

interface RootPkgJson {
  workspaces?: WorkspacesField;
}

interface PnpmWorkspaceFile {
  packages?: string[];
}

/**
 * Discover workspace packages for a repository root. Supports:
 *   - npm / yarn v1 / yarn berry: `workspaces` field in package.json (array or `{packages: []}`)
 *   - pnpm: `pnpm-workspace.yaml` with `packages:` list
 *
 * Glob support is deliberately minimal — it only expands a single-segment
 * `*` (matches any directory at that level) since that's what all three
 * package managers use in practice. No globstar, no character classes.
 */
export async function discoverWorkspaces(projectPath: string): Promise<WorkspaceInfo[]> {
  const patterns = await collectPatterns(projectPath);
  if (patterns.length === 0) return [];

  const dirs = await expandPatterns(projectPath, patterns);
  const infos: WorkspaceInfo[] = [];

  for (const dir of dirs) {
    const pkgPath = path.join(dir, 'package.json');
    let pkg: {
      name?: string;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
    };
    try {
      pkg = JSON.parse(await readFile(pkgPath, 'utf-8'));
    } catch {
      continue;
    }

    const directDependencies = [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
      ...Object.keys(pkg.peerDependencies ?? {}),
      ...Object.keys(pkg.optionalDependencies ?? {}),
    ];

    infos.push({
      name: pkg.name ?? path.basename(dir),
      path: dir,
      directDependencies,
    });
  }

  return infos;
}

async function collectPatterns(projectPath: string): Promise<string[]> {
  const patterns: string[] = [];

  // npm / yarn: package.json#workspaces
  try {
    const content = await readFile(path.join(projectPath, 'package.json'), 'utf-8');
    const json = JSON.parse(content) as RootPkgJson;
    const field = json.workspaces;
    if (Array.isArray(field)) {
      patterns.push(...field);
    } else if (field && typeof field === 'object' && Array.isArray(field.packages)) {
      patterns.push(...field.packages);
    }
  } catch {
    // no or invalid package.json
  }

  // pnpm: pnpm-workspace.yaml
  try {
    const content = await readFile(path.join(projectPath, 'pnpm-workspace.yaml'), 'utf-8');
    const parsed = YAML.parse(content) as PnpmWorkspaceFile | null;
    if (parsed && Array.isArray(parsed.packages)) {
      patterns.push(...parsed.packages);
    }
  } catch {
    // no pnpm-workspace.yaml
  }

  return patterns;
}

async function expandPatterns(projectPath: string, patterns: string[]): Promise<string[]> {
  const out = new Set<string>();
  for (const pattern of patterns) {
    for (const dir of await expandOne(projectPath, pattern)) {
      out.add(dir);
    }
  }
  return [...out];
}

async function expandOne(projectPath: string, pattern: string): Promise<string[]> {
  // Literal path
  if (!pattern.includes('*')) {
    const abs = path.resolve(projectPath, pattern);
    if (await isDir(abs)) return [abs];
    return [];
  }

  // Single-star patterns only: "packages/*", "apps/*", "scopes/*/pkg", etc.
  const segments = pattern.split('/');
  const results: string[] = [];

  async function walk(segIndex: number, current: string): Promise<void> {
    if (segIndex === segments.length) {
      if (await isDir(current)) results.push(current);
      return;
    }
    const seg = segments[segIndex]!;
    if (seg === '*') {
      let entries: string[];
      try {
        entries = await readdir(current);
      } catch {
        return;
      }
      for (const entry of entries) {
        if (entry.startsWith('.')) continue;
        await walk(segIndex + 1, path.join(current, entry));
      }
    } else {
      await walk(segIndex + 1, path.join(current, seg));
    }
  }

  await walk(0, projectPath);
  return results;
}

async function isDir(p: string): Promise<boolean> {
  try {
    const s = await stat(p);
    return s.isDirectory();
  } catch {
    return false;
  }
}
