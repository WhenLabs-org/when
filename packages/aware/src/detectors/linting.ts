import * as path from "node:path";
import type { StackItem } from "../types.js";
import { parsePackageJson, getDepVersion } from "../utils/parsers.js";
import { readFile, fileExists } from "../utils/fs.js";
import { hasDep } from "./utils.js";

export async function detectLinting(projectRoot: string): Promise<StackItem[]> {
  const results: StackItem[] = [];
  const pkg = await parsePackageJson(projectRoot);

  if (pkg) {
    // ESLint
    if (hasDep(pkg, "eslint")) {
      const version = getDepVersion(pkg, "eslint");
      let variant: string | null = null;
      if (version) {
        const major = parseInt(version.split(".")[0] ?? "", 10);
        if (!isNaN(major)) {
          variant = major >= 9 ? "flat-config" : "legacy-config";
        }
      }
      results.push({
        name: "eslint",
        version,
        variant,
        confidence: 0.95,
        detectedFrom: "package.json",
      });
    }

    // Prettier
    if (hasDep(pkg, "prettier")) {
      results.push({
        name: "prettier",
        version: getDepVersion(pkg, "prettier"),
        variant: null,
        confidence: 0.90,
        detectedFrom: "package.json",
      });
    }

    // Biome
    if (hasDep(pkg, "@biomejs/biome")) {
      results.push({
        name: "biome",
        version: getDepVersion(pkg, "@biomejs/biome"),
        variant: null,
        confidence: 0.95,
        detectedFrom: "package.json",
      });
    }
  }

  // rustfmt
  if (await fileExists(path.join(projectRoot, "rustfmt.toml"))) {
    results.push({
      name: "rustfmt",
      version: null,
      variant: null,
      confidence: 0.90,
      detectedFrom: "rustfmt.toml",
    });
  } else if (await fileExists(path.join(projectRoot, ".rustfmt.toml"))) {
    results.push({
      name: "rustfmt",
      version: null,
      variant: null,
      confidence: 0.90,
      detectedFrom: ".rustfmt.toml",
    });
  }

  // Ruff (Python)
  const pyprojectContent = await readFile(path.join(projectRoot, "pyproject.toml"));
  if (pyprojectContent && pyprojectContent.toLowerCase().includes("ruff")) {
    results.push({
      name: "ruff",
      version: null,
      variant: null,
      confidence: 0.90,
      detectedFrom: "pyproject.toml",
    });
  } else if (await fileExists(path.join(projectRoot, "ruff.toml"))) {
    results.push({
      name: "ruff",
      version: null,
      variant: null,
      confidence: 0.90,
      detectedFrom: "ruff.toml",
    });
  }

  return results;
}
