import { resolve, dirname } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isWindows = process.platform === 'win32';

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

// Walk up from `start` looking for a node_modules/<pkgName>/package.json.
// Works for flat npm hoisting, nested installs, and pnpm workspace symlinks.
// We can't use `require.resolve(pkgName)` because @whenlabs/* packages have
// an ESM-only `exports` map and createRequire runs in CJS mode, which trips
// ERR_PACKAGE_PATH_NOT_EXPORTED.
function findPackageDir(pkgName: string, start: string): string | null {
  let dir = start;
  for (let i = 0; i < 10; i++) {
    const candidate = resolve(dir, 'node_modules', pkgName, 'package.json');
    if (existsSync(candidate)) return dirname(candidate);
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

// Read the bin path a package declares for our short name. Handles both the
// string form (`"bin": "./cli.js"`) and the object form
// (`"bin": { "aware": "./dist/cli.js" }`).
function readBinField(pkgDir: string, shortName: string): string | null {
  try {
    const manifest = JSON.parse(
      readFileSync(resolve(pkgDir, 'package.json'), 'utf8'),
    );
    const bin = manifest.bin;
    if (typeof bin === 'string') return bin;
    if (bin && typeof bin === 'object') {
      const preferred = bin[shortName];
      if (typeof preferred === 'string') return preferred;
      const first = Object.values(bin).find((v) => typeof v === 'string');
      if (typeof first === 'string') return first;
    }
  } catch {
    // manifest missing or malformed — caller falls through
  }
  return null;
}

// Resolve the CLI entry for a sibling @whenlabs/* package. Several strategies
// in order because real-world installs span flat npm hoisting, nested pnpm
// stores, and workspace symlinks.
export function findBin(name: string): string {
  const pkgName = PACKAGE_MAP[name] ?? `@whenlabs/${name}`;

  // 1. Locate the sibling package by walking node_modules upwards, then read
  //    its manifest to discover the exact bin path. The bin field is the
  //    source of truth — hard-coding `dist/cli.js` is brittle.
  const pkgDir = findPackageDir(pkgName, __dirname);
  if (pkgDir) {
    const binRel = readBinField(pkgDir, name);
    if (binRel) {
      const abs = resolve(pkgDir, binRel);
      if (existsSync(abs)) return abs;
    }
    // Fallback within the resolved package: the conventional path.
    const conventional = resolve(pkgDir, 'dist', 'cli.js');
    if (existsSync(conventional)) return conventional;
  }

  // 2. Walk up from this file looking for a node_modules/.bin/<name> shim.
  //    Covers installs where strategy 1 can't locate the package (unlikely
  //    but cheap insurance). Windows gets the .cmd shim; unix gets the
  //    plain bin.
  const shimNames = isWindows ? [`${name}.cmd`, name] : [name];
  let dir = __dirname;
  for (let i = 0; i < 6; i++) {
    for (const shim of shimNames) {
      const candidate = resolve(dir, 'node_modules', '.bin', shim);
      if (existsSync(candidate)) return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  // 3. Last resort: rely on PATH. Usually only works in dev shells that have
  //    the workspace bin on PATH.
  return name;
}

// Return the exact argv needed to spawn a sibling CLI. On Windows, .js files
// can't be executed directly via spawn() — they need an explicit `node` call —
// and .cmd shims need shell: true to be invoked. Centralising this keeps
// every call site correct.
export function buildSpawn(
  name: string,
): { cmd: string; args: string[]; shell?: boolean } {
  const resolved = findBin(name);
  if (resolved.endsWith('.js')) {
    return { cmd: process.execPath, args: [resolved] };
  }
  if (isWindows && resolved.toLowerCase().endsWith('.cmd')) {
    return { cmd: resolved, args: [], shell: true };
  }
  return { cmd: resolved, args: [] };
}
