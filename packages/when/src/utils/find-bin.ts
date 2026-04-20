import { resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Maps the short tool name (as used by MCP) to the installed package name.
// Most are `@whenlabs/<name>` but velocity is published as velocity-mcp.
const PACKAGE_MAP: Record<string, string> = {
  aware: '@whenlabs/aware',
  berth: '@whenlabs/berth',
  envalid: '@whenlabs/envalid',
  stale: '@whenlabs/stale',
  vow: '@whenlabs/vow',
  velocity: '@whenlabs/velocity-mcp',
};

// Resolve the CLI entry for a sibling @whenlabs/* package. We try several
// strategies in order because real-world installs span flat npm hoisting,
// nested pnpm stores, and workspace symlinks — any one strategy is fragile.
export function findBin(name: string): string {
  const pkgName = PACKAGE_MAP[name] ?? `@whenlabs/${name}`;

  // 1. Ask Node's module resolver. This is package-manager-agnostic and
  //    handles flat hoisting, nested node_modules, and pnpm's .pnpm store.
  try {
    const pkgJsonPath = require.resolve(`${pkgName}/package.json`);
    const pkgDir = dirname(pkgJsonPath);
    const cliPath = resolve(pkgDir, 'dist', 'cli.js');
    if (existsSync(cliPath)) return cliPath;
  } catch {
    // package not resolvable from here — fall through to heuristics
  }

  // 2. Walk up from this file looking for a node_modules/.bin/<name> symlink.
  //    Covers the case where the CLI ships a bin but the package.json lookup
  //    above failed (e.g. name mismatch, exports restrictions).
  let dir = __dirname;
  for (let i = 0; i < 6; i++) {
    const candidate = resolve(dir, 'node_modules', '.bin', name);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  // 3. Last resort: rely on PATH. Usually only works in dev shells that have
  //    the workspace bin on PATH.
  return name;
}
