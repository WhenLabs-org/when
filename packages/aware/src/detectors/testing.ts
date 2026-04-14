import * as path from "node:path";
import type { StackItem } from "../types.js";
import { parsePackageJson, getDepVersion } from "../utils/parsers.js";
import { readFile, fileExists } from "../utils/fs.js";
import { hasDep } from "./utils.js";

export async function detectTesting(projectRoot: string): Promise<StackItem[]> {
  const results: StackItem[] = [];
  const pkg = await parsePackageJson(projectRoot);

  if (pkg) {
    // Vitest
    if (hasDep(pkg, "vitest")) {
      results.push({
        name: "vitest",
        version: getDepVersion(pkg, "vitest"),
        variant: null,
        confidence: 0.95,
        detectedFrom: "package.json",
      });
    }

    // Jest
    if (hasDep(pkg, "jest")) {
      results.push({
        name: "jest",
        version: getDepVersion(pkg, "jest"),
        variant: null,
        confidence: 0.90,
        detectedFrom: "package.json",
      });
    }

    // Playwright
    if (hasDep(pkg, "@playwright/test")) {
      results.push({
        name: "playwright",
        version: getDepVersion(pkg, "@playwright/test"),
        variant: null,
        confidence: 0.95,
        detectedFrom: "package.json",
      });
    }

    // Cypress
    if (hasDep(pkg, "cypress")) {
      results.push({
        name: "cypress",
        version: getDepVersion(pkg, "cypress"),
        variant: null,
        confidence: 0.90,
        detectedFrom: "package.json",
      });
    }

    // Testing Library
    if (hasDep(pkg, "@testing-library/react") || hasDep(pkg, "@testing-library/vue") || hasDep(pkg, "@testing-library/svelte")) {
      const version = getDepVersion(pkg, "@testing-library/react")
        ?? getDepVersion(pkg, "@testing-library/vue")
        ?? getDepVersion(pkg, "@testing-library/svelte");
      results.push({
        name: "testing-library",
        version,
        variant: null,
        confidence: 0.85,
        detectedFrom: "package.json",
      });
    }
  }

  // Pytest (Python)
  const reqContent = await readFile(path.join(projectRoot, "requirements.txt"));
  const pyprojectContent = await readFile(path.join(projectRoot, "pyproject.toml"));

  if (
    (reqContent && reqContent.toLowerCase().includes("pytest")) ||
    (pyprojectContent && pyprojectContent.toLowerCase().includes("pytest"))
  ) {
    const detectedFrom = reqContent?.toLowerCase().includes("pytest") ? "requirements.txt" : "pyproject.toml";
    results.push({
      name: "pytest",
      version: null,
      variant: null,
      confidence: 0.90,
      detectedFrom,
    });
  }

  return results;
}
