import { execSync } from 'node:child_process';
import { basename, resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

/**
 * Canonical project identifier: git remote origin name, falling back to cwd basename.
 * Returns null only if even basename lookup throws.
 */
export function detectProjectName(cwd?: string): string | null {
  const dir = cwd ?? process.cwd();
  try {
    const remote = execSync('git remote get-url origin', {
      stdio: 'pipe',
      encoding: 'utf-8',
      cwd: dir,
    }).trim();
    const match = remote.match(/\/([^/]+?)(?:\.git)?$/) ?? remote.match(/:([^/]+?)(?:\.git)?$/);
    if (match?.[1]) return match[1];
  } catch {
    // Not a git repo or no remote
  }

  try {
    return basename(dir);
  } catch {
    return null;
  }
}

/**
 * Directory-basename-only identifier. Used for cache keys where stability
 * across remote changes matters more than uniqueness across forks.
 */
export function detectProjectDirName(cwd?: string): string {
  const dir = cwd ?? process.cwd();
  return dir.replace(/\\/g, '/').split('/').filter(Boolean).pop() || 'unknown';
}

/**
 * Read the project name from .aware.json if present, else null.
 */
export function readAwareProjectName(cwd?: string): string | null {
  try {
    const awareFile = resolve(cwd ?? process.cwd(), '.aware.json');
    if (!existsSync(awareFile)) return null;
    const data = JSON.parse(readFileSync(awareFile, 'utf8')) as { name?: string; project?: string };
    return data.name ?? data.project ?? null;
  } catch {
    return null;
  }
}

const STACK_FILES: ReadonlyArray<readonly [string, string]> = [
  ['package.json', 'node'],
  ['Cargo.toml', 'rust'],
  ['go.mod', 'go'],
  ['pyproject.toml', 'python'],
  ['requirements.txt', 'python'],
  ['Gemfile', 'ruby'],
  ['build.gradle', 'java'],
  ['pom.xml', 'java'],
  ['mix.exs', 'elixir'],
  ['pubspec.yaml', 'dart'],
];

/**
 * Detect the primary stack(s) from manifest files present in cwd.
 */
export function detectProjectStack(cwd?: string): string {
  const dir = cwd ?? process.cwd();
  const stacks: string[] = [];
  for (const [file, stack] of STACK_FILES) {
    if (existsSync(resolve(dir, file)) && !stacks.includes(stack)) {
      stacks.push(stack);
    }
  }
  return stacks.length > 0 ? stacks.join(', ') : 'unknown';
}

export interface ProjectInfo {
  name: string;
  stack: string;
}

/**
 * Combined project identity + stack, as consumed by `when init`.
 * Prefers package.json name when present (npm convention), else basename.
 */
export function detectProjectWithStack(cwd?: string): ProjectInfo {
  const dir = cwd ?? process.cwd();
  let name = basename(dir);
  const pkgPath = resolve(dir, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { name?: string };
      if (pkg.name) name = pkg.name;
    } catch {
      // use directory name
    }
  }
  return { name, stack: detectProjectStack(dir) };
}

/**
 * @deprecated Prefer `detectProjectName`. Kept for pre-existing callers.
 */
export function detectProject(): string | null {
  return detectProjectName();
}
