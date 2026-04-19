import * as yaml from "js-yaml";
import * as tomlParser from "toml";
import * as dotenvParser from "dotenv";
import { readFile } from "./fs.js";
import * as path from "node:path";
import type { PackageJson } from "../types.js";
import { readLockfile, type LockfileVersionMap } from "../core/lockfile.js";

export async function parsePackageJson(projectRoot: string): Promise<PackageJson | null> {
  const content = await readFile(path.join(projectRoot, "package.json"));
  if (!content) return null;
  try {
    return JSON.parse(content) as PackageJson;
  } catch {
    return null;
  }
}

/**
 * Load package.json and the project's lockfile in one call. Detectors that
 * need precise installed versions (currently framework + styling for
 * Phase 2 version-aware fragments) use this; older detectors can keep
 * calling `parsePackageJson` directly and get range-based versions.
 */
export async function loadProjectDeps(
  projectRoot: string,
): Promise<{ pkg: PackageJson | null; lockfile: LockfileVersionMap }> {
  const [pkg, lockfile] = await Promise.all([
    parsePackageJson(projectRoot),
    readLockfile(projectRoot),
  ]);
  return { pkg, lockfile };
}

export async function parseToml(filePath: string): Promise<Record<string, unknown> | null> {
  const content = await readFile(filePath);
  if (!content) return null;
  try {
    return tomlParser.parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function parseYaml(filePath: string): Promise<Record<string, unknown> | null> {
  const content = await readFile(filePath);
  if (!content) return null;
  try {
    return yaml.load(content) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function parseDotenv(filePath: string): Promise<Record<string, string>> {
  const content = await readFile(filePath);
  if (!content) return {};
  try {
    return dotenvParser.parse(content);
  } catch {
    return {};
  }
}

export function cleanVersion(version: string): string {
  const cleaned = version.replace(/^[~^>=<\s]+/, "");
  const parts = cleaned.split(".");
  if (parts.length >= 2) {
    return `${parts[0]}.${parts[1]}`;
  }
  return parts[0] ?? version;
}

export function getAllDeps(pkg: PackageJson): Record<string, string> {
  return { ...pkg.dependencies, ...pkg.devDependencies };
}

/**
 * Resolve the installed version of a dependency, preferring the lockfile
 * over the package.json range. Returns `cleanVersion` output (major.minor)
 * — callers that need the full semver should use `getRawDepVersion`.
 *
 * Contract:
 *   - Lockfile wins (it says "actually 15.1.2"; package.json says "^15.0.0")
 *   - Falls through to package.json range if lockfile doesn't list it
 *   - Returns null if the dependency isn't declared at all
 */
export function getDepVersion(
  pkg: PackageJson,
  name: string,
  lockfile?: LockfileVersionMap,
): string | null {
  const raw = getRawDepVersion(pkg, name, lockfile);
  return raw ? cleanVersion(raw) : null;
}

/** Same as `getDepVersion` but returns the unshortened semver string. */
export function getRawDepVersion(
  pkg: PackageJson,
  name: string,
  lockfile?: LockfileVersionMap,
): string | null {
  const locked = lockfile?.get(name);
  if (locked) return locked;
  const declared = pkg.dependencies?.[name] ?? pkg.devDependencies?.[name];
  return declared ?? null;
}
