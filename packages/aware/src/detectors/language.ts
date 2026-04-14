import * as path from "node:path";
import type { StackItem } from "../types.js";
import { parsePackageJson, parseToml, getDepVersion } from "../utils/parsers.js";
import { readFile, fileExists } from "../utils/fs.js";

export async function detectLanguage(projectRoot: string): Promise<StackItem | null> {
  // 1. TypeScript
  if (await fileExists(path.join(projectRoot, "tsconfig.json"))) {
    const pkg = await parsePackageJson(projectRoot);
    const version = pkg ? getDepVersion(pkg, "typescript") : null;
    return {
      name: "typescript",
      version,
      variant: null,
      confidence: 0.99,
      detectedFrom: "tsconfig.json",
    };
  }

  // 2. JavaScript (package.json exists)
  const pkg = await parsePackageJson(projectRoot);
  if (pkg) {
    return {
      name: "javascript",
      version: null,
      variant: null,
      confidence: 0.80,
      detectedFrom: "package.json",
    };
  }

  // 3. Rust
  if (await fileExists(path.join(projectRoot, "Cargo.toml"))) {
    let version: string | null = null;
    const toolchain = await readFile(path.join(projectRoot, "rust-toolchain.toml"));
    if (toolchain) {
      const match = toolchain.match(/channel\s*=\s*"([^"]+)"/);
      if (match?.[1]) version = match[1];
    }
    return {
      name: "rust",
      version,
      variant: null,
      confidence: 0.99,
      detectedFrom: "Cargo.toml",
    };
  }

  // 4. Python
  const pythonVersion = await readFile(path.join(projectRoot, ".python-version"));
  if (pythonVersion) {
    return {
      name: "python",
      version: pythonVersion.trim(),
      variant: null,
      confidence: 0.95,
      detectedFrom: ".python-version",
    };
  }

  const pyproject = await parseToml(path.join(projectRoot, "pyproject.toml"));
  if (pyproject) {
    let version: string | null = null;
    const project = pyproject.project as Record<string, unknown> | undefined;
    if (project?.["requires-python"]) {
      const raw = project["requires-python"] as string;
      const match = raw.match(/(\d+\.\d+)/);
      if (match?.[1]) version = match[1];
    }
    return {
      name: "python",
      version,
      variant: null,
      confidence: 0.95,
      detectedFrom: "pyproject.toml",
    };
  }

  // 5. Go
  const goMod = await readFile(path.join(projectRoot, "go.mod"));
  if (goMod) {
    let version: string | null = null;
    const match = goMod.match(/^go\s+(\S+)/m);
    if (match?.[1]) version = match[1];
    return {
      name: "go",
      version,
      variant: null,
      confidence: 0.99,
      detectedFrom: "go.mod",
    };
  }

  return null;
}
