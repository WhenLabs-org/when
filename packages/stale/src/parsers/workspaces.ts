import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import fg from 'fast-glob';
import { parse as parseYaml } from 'yaml';

export interface Workspace {
  name: string;
  relativePath: string;
  packageJson: Record<string, unknown>;
}

export interface WorkspaceLayout {
  isMonorepo: boolean;
  workspaces: Workspace[];
}

async function readJson(path: string): Promise<Record<string, unknown> | null> {
  try {
    const raw = await readFile(path, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function expandPatterns(projectPath: string, patterns: string[]): Promise<Workspace[]> {
  const pkgDirs = await fg(
    patterns.map((p) => (p.endsWith('/') ? `${p}package.json` : `${p}/package.json`)),
    { cwd: projectPath, ignore: ['**/node_modules/**'] },
  );
  const workspaces: Workspace[] = [];
  for (const rel of pkgDirs) {
    const pkg = await readJson(join(projectPath, rel));
    if (!pkg) continue;
    const dir = rel.slice(0, rel.length - '/package.json'.length) || '.';
    workspaces.push({
      name: (pkg.name as string) ?? dir,
      relativePath: dir,
      packageJson: pkg,
    });
  }
  return workspaces;
}

export async function detectWorkspaces(projectPath: string): Promise<WorkspaceLayout> {
  const rootPkg = await readJson(join(projectPath, 'package.json'));

  let patterns: string[] | null = null;

  if (rootPkg) {
    const ws = rootPkg.workspaces;
    if (Array.isArray(ws)) patterns = ws as string[];
    else if (ws && typeof ws === 'object' && Array.isArray((ws as { packages?: unknown }).packages)) {
      patterns = (ws as { packages: string[] }).packages;
    }
  }

  if (!patterns) {
    try {
      const raw = await readFile(join(projectPath, 'pnpm-workspace.yaml'), 'utf-8');
      const parsed = parseYaml(raw);
      if (parsed && Array.isArray(parsed.packages)) {
        patterns = parsed.packages as string[];
      }
    } catch {
      // not a pnpm workspace
    }
  }

  if (!patterns || patterns.length === 0) {
    return { isMonorepo: false, workspaces: [] };
  }

  const workspaces = await expandPatterns(projectPath, patterns);
  return { isMonorepo: workspaces.length > 0, workspaces };
}
