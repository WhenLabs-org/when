import type { StackItem } from "../types.js";
import { parsePackageJson, getDepVersion } from "../utils/parsers.js";
import { hasDep, globFiles } from "./utils.js";

export async function detectStyling(projectRoot: string): Promise<StackItem | null> {
  const pkg = await parsePackageJson(projectRoot);
  if (!pkg) return null;

  // Tailwind CSS
  if (hasDep(pkg, "tailwindcss")) {
    return {
      name: "tailwindcss",
      version: getDepVersion(pkg, "tailwindcss"),
      variant: null,
      confidence: 0.95,
      detectedFrom: "package.json",
    };
  }

  // styled-components
  if (hasDep(pkg, "styled-components")) {
    return {
      name: "styled-components",
      version: getDepVersion(pkg, "styled-components"),
      variant: null,
      confidence: 0.90,
      detectedFrom: "package.json",
    };
  }

  // Emotion
  if (hasDep(pkg, "@emotion/react") || hasDep(pkg, "@emotion/styled") || hasDep(pkg, "@emotion/css")) {
    const version = getDepVersion(pkg, "@emotion/react") ?? getDepVersion(pkg, "@emotion/styled") ?? getDepVersion(pkg, "@emotion/css");
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
      version: getDepVersion(pkg, "sass") ?? getDepVersion(pkg, "node-sass"),
      variant: null,
      confidence: 0.80,
      detectedFrom: "package.json",
    };
  }

  // vanilla-extract
  if (hasDep(pkg, "@vanilla-extract/css")) {
    return {
      name: "vanilla-extract",
      version: getDepVersion(pkg, "@vanilla-extract/css"),
      variant: null,
      confidence: 0.90,
      detectedFrom: "package.json",
    };
  }

  // CSS Modules (check for *.module.css files)
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
