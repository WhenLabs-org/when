import * as path from "node:path";
import type { StackItem } from "../types.js";
import { parsePackageJson, cleanVersion } from "../utils/parsers.js";
import { fileExists } from "../utils/fs.js";

export async function detectPackageManager(projectRoot: string): Promise<StackItem | null> {
  // Lockfile priority order
  if (await fileExists(path.join(projectRoot, "pnpm-lock.yaml"))) {
    return {
      name: "pnpm",
      version: null,
      variant: null,
      confidence: 0.99,
      detectedFrom: "pnpm-lock.yaml",
    };
  }

  if (
    (await fileExists(path.join(projectRoot, "bun.lockb"))) ||
    (await fileExists(path.join(projectRoot, "bun.lock")))
  ) {
    return {
      name: "bun",
      version: null,
      variant: null,
      confidence: 0.99,
      detectedFrom: "bun.lockb",
    };
  }

  if (await fileExists(path.join(projectRoot, "yarn.lock"))) {
    return {
      name: "yarn",
      version: null,
      variant: null,
      confidence: 0.99,
      detectedFrom: "yarn.lock",
    };
  }

  if (await fileExists(path.join(projectRoot, "package-lock.json"))) {
    return {
      name: "npm",
      version: null,
      variant: null,
      confidence: 0.99,
      detectedFrom: "package-lock.json",
    };
  }

  // packageManager field in package.json
  const pkg = await parsePackageJson(projectRoot);
  if (pkg?.packageManager) {
    const match = pkg.packageManager.match(/^(\w+)@(.+)$/);
    if (match?.[1] && match[2]) {
      return {
        name: match[1],
        version: cleanVersion(match[2]),
        variant: null,
        confidence: 0.95,
        detectedFrom: "package.json#packageManager",
      };
    }
  }

  // Cargo.lock (Rust)
  if (await fileExists(path.join(projectRoot, "Cargo.lock"))) {
    return {
      name: "cargo",
      version: null,
      variant: null,
      confidence: 0.99,
      detectedFrom: "Cargo.lock",
    };
  }

  // Python package managers
  if (await fileExists(path.join(projectRoot, "poetry.lock"))) {
    return {
      name: "poetry",
      version: null,
      variant: null,
      confidence: 0.95,
      detectedFrom: "poetry.lock",
    };
  }

  if (await fileExists(path.join(projectRoot, "Pipfile.lock"))) {
    return {
      name: "pipenv",
      version: null,
      variant: null,
      confidence: 0.95,
      detectedFrom: "Pipfile.lock",
    };
  }

  if (await fileExists(path.join(projectRoot, "uv.lock"))) {
    return {
      name: "uv",
      version: null,
      variant: null,
      confidence: 0.95,
      detectedFrom: "uv.lock",
    };
  }

  return null;
}
