import * as path from "node:path";
import type { StackItem } from "../types.js";
import { parsePackageJson } from "../utils/parsers.js";
import { fileExists } from "../utils/fs.js";

export async function detectMonorepo(projectRoot: string): Promise<StackItem | null> {
  // Turborepo
  if (await fileExists(path.join(projectRoot, "turbo.json"))) {
    return {
      name: "turborepo",
      version: null,
      variant: null,
      confidence: 0.99,
      detectedFrom: "turbo.json",
    };
  }

  // Nx
  if (await fileExists(path.join(projectRoot, "nx.json"))) {
    return {
      name: "nx",
      version: null,
      variant: null,
      confidence: 0.99,
      detectedFrom: "nx.json",
    };
  }

  // pnpm workspaces
  if (await fileExists(path.join(projectRoot, "pnpm-workspace.yaml"))) {
    return {
      name: "pnpm-workspaces",
      version: null,
      variant: null,
      confidence: 0.90,
      detectedFrom: "pnpm-workspace.yaml",
    };
  }

  // Lerna
  if (await fileExists(path.join(projectRoot, "lerna.json"))) {
    return {
      name: "lerna",
      version: null,
      variant: null,
      confidence: 0.90,
      detectedFrom: "lerna.json",
    };
  }

  // package.json workspaces
  const pkg = await parsePackageJson(projectRoot);
  if (pkg?.workspaces) {
    return {
      name: "workspaces",
      version: null,
      variant: null,
      confidence: 0.80,
      detectedFrom: "package.json#workspaces",
    };
  }

  return null;
}
