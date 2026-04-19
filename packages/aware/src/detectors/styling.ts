import type { StackItem } from "../types.js";
import { loadProjectDeps, getDepVersion } from "../utils/parsers.js";
import { hasDep, globFiles } from "./utils.js";

export async function detectStyling(projectRoot: string): Promise<StackItem | null> {
  // Lockfile-aware version resolution so Tailwind v3 vs v4 fragment
  // selection sees the actual installed version, not the declared range.
  const { pkg, lockfile } = await loadProjectDeps(projectRoot);
  if (!pkg) {
    // Fall through to the lockfile-free path: glob for CSS modules below.
    return detectCssModulesOnly(projectRoot);
  }

  // Tailwind CSS
  if (hasDep(pkg, "tailwindcss")) {
    return {
      name: "tailwindcss",
      version: getDepVersion(pkg, "tailwindcss", lockfile),
      variant: null,
      confidence: 0.95,
      detectedFrom: "package.json",
    };
  }

  // styled-components
  if (hasDep(pkg, "styled-components")) {
    return {
      name: "styled-components",
      version: getDepVersion(pkg, "styled-components", lockfile),
      variant: null,
      confidence: 0.90,
      detectedFrom: "package.json",
    };
  }

  // Emotion
  if (hasDep(pkg, "@emotion/react") || hasDep(pkg, "@emotion/styled") || hasDep(pkg, "@emotion/css")) {
    const version =
      getDepVersion(pkg, "@emotion/react", lockfile) ??
      getDepVersion(pkg, "@emotion/styled", lockfile) ??
      getDepVersion(pkg, "@emotion/css", lockfile);
    return {
      name: "emotion",
      version,
      variant: null,
      confidence: 0.90,
      detectedFrom: "package.json",
    };
  }

  // Sass
  if (hasDep(pkg, "sass") || hasDep(pkg, "node-sass")) {
    return {
      name: "sass",
      version:
        getDepVersion(pkg, "sass", lockfile) ??
        getDepVersion(pkg, "node-sass", lockfile),
      variant: null,
      confidence: 0.80,
      detectedFrom: "package.json",
    };
  }

  // vanilla-extract
  if (hasDep(pkg, "@vanilla-extract/css")) {
    return {
      name: "vanilla-extract",
      version: getDepVersion(pkg, "@vanilla-extract/css", lockfile),
      variant: null,
      confidence: 0.90,
      detectedFrom: "package.json",
    };
  }

  return detectCssModulesOnly(projectRoot);
}

async function detectCssModulesOnly(projectRoot: string): Promise<StackItem | null> {
  const moduleFiles = await globFiles(projectRoot, "**/*.module.css");
  if (moduleFiles.length > 0) {
    return {
      name: "css-modules",
      version: null,
      variant: null,
      confidence: 0.70,
      detectedFrom: "*.module.css files",
    };
  }
  return null;
}
