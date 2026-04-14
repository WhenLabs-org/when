import * as yaml from "js-yaml";
import * as tomlParser from "toml";
import * as dotenvParser from "dotenv";
import { readFile } from "./fs.js";
import * as path from "node:path";
import type { PackageJson } from "../types.js";

export async function parsePackageJson(projectRoot: string): Promise<PackageJson | null> {
  const content = await readFile(path.join(projectRoot, "package.json"));
  if (!content) return null;
  try {
    return JSON.parse(content) as PackageJson;
  } catch {
    return null;
  }
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

export function getDepVersion(pkg: PackageJson, name: string): string | null {
  const version = pkg.dependencies?.[name] ?? pkg.devDependencies?.[name];
  if (!version) return null;
  return cleanVersion(version);
}
