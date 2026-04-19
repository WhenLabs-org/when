import * as path from "node:path";
import * as yaml from "js-yaml";
import { readFile } from "../utils/fs.js";

/**
 * Resolved dependency versions from a project's lockfile. Authoritative for
 * "which version is actually installed" — beats `package.json` ranges,
 * which only say "any version that satisfies `^15.0.0`".
 *
 * Phase 2's version-aware fragment resolution relies on this: to pick
 * `nextjs-15` vs `nextjs-14`, we need the exact major that's installed,
 * not the range the author wrote.
 *
 * The reader is best-effort: any parse error yields an empty map, so
 * callers can always fall back to package.json ranges.
 */
export type LockfileVersionMap = Map<string, string>;

/**
 * Read whichever JS lockfile is present in the project. Checks in priority
 * order (pnpm > npm > yarn) — if multiple are present, pnpm wins because
 * it's the most specific in real-world monorepos.
 *
 * Non-JS lockfiles (Cargo.lock, poetry.lock) are intentionally deferred
 * to a later phase when Rust/Python fragments split by version.
 */
export async function readLockfile(projectRoot: string): Promise<LockfileVersionMap> {
  const pnpm = await readPnpmLockfile(projectRoot);
  if (pnpm.size > 0) return pnpm;

  const npm = await readNpmLockfile(projectRoot);
  if (npm.size > 0) return npm;

  const yarn = await readYarnLockfile(projectRoot);
  if (yarn.size > 0) return yarn;

  return new Map();
}

/**
 * Parse a pnpm-lock.yaml. Supported: lockfileVersion 6.0+ (pnpm v7+),
 * which uses the `importers` top-level structure. Earlier pnpm versions
 * (v5 / v6 with lockfileVersion 5.x) used a different shape entirely
 * (package keys like `/next/14.2.1` at top-level) and are not supported
 * — callers get an empty map and fall back to package.json ranges.
 */
async function readPnpmLockfile(projectRoot: string): Promise<LockfileVersionMap> {
  const content = await readFile(path.join(projectRoot, "pnpm-lock.yaml"));
  if (!content) return new Map();

  let parsed: unknown;
  try {
    parsed = yaml.load(content);
  } catch {
    return new Map();
  }
  if (!isObject(parsed)) return new Map();

  const map: LockfileVersionMap = new Map();

  // pnpm v7+: importers.*.dependencies.*.version and .devDependencies.*.version
  // The root package lives at importers["."].
  const importers = parsed.importers;
  if (isObject(importers)) {
    for (const pkgKey of Object.keys(importers)) {
      const importer = importers[pkgKey];
      if (!isObject(importer)) continue;
      for (const field of ["dependencies", "devDependencies"] as const) {
        const deps = importer[field];
        if (!isObject(deps)) continue;
        for (const [name, spec] of Object.entries(deps)) {
          const version = extractPnpmVersion(spec);
          if (version) map.set(name, version);
        }
      }
    }
  }

  return map;
}

function extractPnpmVersion(spec: unknown): string | null {
  // Shape-polymorphic: `spec` may be a bare string (older pnpm) or an
  // object `{ specifier, version }` (v7+). pnpm sometimes appends a peer
  // suffix like `1.0.0(peer@2.0.0)` — strip it.
  if (typeof spec === "string") return stripPeerSuffix(spec);
  if (isObject(spec) && typeof spec.version === "string") {
    return stripPeerSuffix(spec.version);
  }
  return null;
}

function stripPeerSuffix(version: string): string {
  const idx = version.indexOf("(");
  return idx === -1 ? version : version.slice(0, idx);
}

async function readNpmLockfile(projectRoot: string): Promise<LockfileVersionMap> {
  const content = await readFile(path.join(projectRoot, "package-lock.json"));
  if (!content) return new Map();

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return new Map();
  }
  if (!isObject(parsed)) return new Map();

  const map: LockfileVersionMap = new Map();

  // npm v3+: packages[path].version, keyed by "node_modules/<name>" or ""
  // (root). We only want direct dependencies — take any package under
  // top-level node_modules, not nested ones, to avoid reporting a
  // transitive version that differs from the direct-dep version.
  const packages = parsed.packages;
  if (isObject(packages)) {
    for (const [key, entry] of Object.entries(packages)) {
      if (!key.startsWith("node_modules/")) continue;
      // Skip nested deps: "node_modules/foo/node_modules/bar" — we only
      // want top-level resolutions.
      if (key.indexOf("/node_modules/", "node_modules/".length) !== -1) continue;
      if (!isObject(entry)) continue;
      const version = entry.version;
      if (typeof version !== "string") continue;
      const name = key.slice("node_modules/".length);
      map.set(name, version);
    }
  }

  // v1/v2 fallback: top-level `dependencies` tree with nested version.
  if (map.size === 0 && isObject(parsed.dependencies)) {
    for (const [name, entry] of Object.entries(parsed.dependencies)) {
      if (isObject(entry) && typeof entry.version === "string") {
        map.set(name, entry.version);
      }
    }
  }

  return map;
}

async function readYarnLockfile(projectRoot: string): Promise<LockfileVersionMap> {
  const content = await readFile(path.join(projectRoot, "yarn.lock"));
  if (!content) return new Map();

  const map: LockfileVersionMap = new Map();

  // yarn.lock supports two dialects we care about:
  //   Classic:  "next@^15.1.0":      then    version "15.1.2"
  //   Berry:    "next@npm:^15.1.0":  then    version: 15.1.2
  //
  // Headers may also be unquoted (`react@^19.0.0:`), multi-key
  // (`"foo@^1, foo@^1.2":`), scoped (`"@types/node@^20":`), or carry a
  // protocol prefix like `@npm:` (berry's aliased-package syntax).
  //
  // Approach: detect header vs. indented-field lines by indentation.
  // For headers, strip the outer quotes/colon and parse the first
  // `<name>@<range>` pair with a scope-aware regex. For fields, accept
  // either `version "X"` (classic) or `version: X` (berry).
  const lines = content.split("\n");
  let currentName: string | null = null;

  for (const line of lines) {
    const isIndented = line.startsWith(" ") || line.startsWith("\t");
    const trimmed = line.trim();

    if (!isIndented && trimmed.length > 0 && !trimmed.startsWith("#")) {
      currentName = parseYarnHeaderName(trimmed);
      continue;
    }

    if (currentName && isIndented) {
      const vm = line.match(/^\s+version[\s:]+"?([^"\s]+)"?/);
      if (vm?.[1] && !map.has(currentName)) {
        map.set(currentName, vm[1]);
      }
    }
  }

  return map;
}

/**
 * Extract the dependency name from a yarn.lock header line.
 * Header forms this recognizes:
 *   react@^19.0.0:
 *   "next@^15.1.0":
 *   "next@npm:^15.1.0":
 *   "@types/node@^20":
 *   "foo@^1.0, foo@^1.2":
 * Berry's `__metadata:` header is intentionally rejected (no `@` in
 * its key) so it doesn't leak in as a bogus package.
 */
function parseYarnHeaderName(headerLine: string): string | null {
  // Strip outer quotes and trailing colon.
  let s = headerLine.replace(/:$/, "").trim();
  if (s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1);

  // Take the first key before any comma (multi-key headers).
  const firstKey = s.split(",")[0]?.trim();
  if (!firstKey) return null;

  // Scoped: `@scope/name@range`. Non-scoped: `name@range`.
  // The `@` separating name from range is the LAST `@` in the key for
  // scoped packages (because the scope also starts with `@`), or the
  // only `@` for non-scoped. `lastIndexOf` works for both.
  const atIdx = firstKey.lastIndexOf("@");
  if (atIdx <= 0) return null; // no range separator, or bare `@` at start
  const name = firstKey.slice(0, atIdx);
  return name.length > 0 ? name : null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
