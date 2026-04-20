import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname, relative } from "node:path";
import type { EnvSchema } from "../schema/types.js";

export interface FileLocation {
  file: string;
  line: number;
  context?: string; // the source line where the env var was referenced
}

export interface DetectionResult {
  usedInCode: string[];
  inSchemaNotUsed: string[];
  usedNotInSchema: string[];
  /** Map from var name to all file:line locations where it appears */
  locations: Record<string, FileLocation[]>;
}

// Patterns that reference env vars across languages/frameworks
const ENV_PATTERNS = [
  // JavaScript/TypeScript: process.env.VAR_NAME or process.env["VAR_NAME"]
  /process\.env\.([A-Za-z][A-Za-z0-9_]*)/g,
  /process\.env\["([A-Za-z][A-Za-z0-9_]*)"\]/g,
  /process\.env\['([A-Za-z][A-Za-z0-9_]*)'\]/g,

  // Vite/Astro: import.meta.env.VAR_NAME
  /import\.meta\.env\.([A-Za-z][A-Za-z0-9_]*)/g,

  // Python: os.environ["VAR"] or os.environ.get("VAR") or os.getenv("VAR")
  /os\.environ\["([A-Za-z][A-Za-z0-9_]*)"\]/g,
  /os\.environ\['([A-Za-z][A-Za-z0-9_]*)'\]/g,
  /os\.environ\.get\(["']([A-Za-z][A-Za-z0-9_]*)["']/g,
  /os\.getenv\(["']([A-Za-z][A-Za-z0-9_]*)["']/g,

  // Ruby: ENV["VAR"] or ENV['VAR'] or ENV.fetch("VAR")
  /ENV\["([A-Za-z][A-Za-z0-9_]*)"\]/g,
  /ENV\['([A-Za-z][A-Za-z0-9_]*)'\]/g,
  /ENV\.fetch\(["']([A-Za-z][A-Za-z0-9_]*)["']/g,

  // Go: os.Getenv("VAR")
  /os\.Getenv\("([A-Za-z][A-Za-z0-9_]*)"\)/g,

  // Rust: std::env::var("VAR") or env::var("VAR")
  /env::var\("([A-Za-z][A-Za-z0-9_]*)"\)/g,

  // PHP: getenv("VAR") or $_ENV["VAR"]
  /getenv\(["']([A-Za-z][A-Za-z0-9_]*)["']\)/g,
  /\$_ENV\["([A-Za-z][A-Za-z0-9_]*)"\]/g,
  /\$_ENV\['([A-Za-z][A-Za-z0-9_]*)'\]/g,
];

const DEFAULT_EXCLUDE = [
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  "coverage",
  ".next",
  ".nuxt",
  ".turbo",
  ".cache",
  "__pycache__",
  "vendor",
  ".venv",
  "venv",
];

const SCANNABLE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".rb",
  ".go",
  ".rs",
  ".php",
  ".java",
  ".kt",
  ".swift",
  ".vue",
  ".svelte",
]);

function collectFiles(
  dir: string,
  exclude: string[],
  files: string[] = [],
): string[] {
  const entries = readdirSync(dir);
  for (const entry of entries) {
    if (exclude.includes(entry) || entry.startsWith(".")) continue;
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      collectFiles(fullPath, exclude, files);
    } else if (SCANNABLE_EXTENSIONS.has(extname(entry))) {
      files.push(fullPath);
    }
  }
  return files;
}

function extractEnvVars(content: string): Set<string> {
  const vars = new Set<string>();
  for (const pattern of ENV_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      vars.add(match[1]);
    }
  }
  return vars;
}

function extractEnvVarsWithLocations(
  content: string,
  filePath: string,
  rootDir: string,
): Map<string, FileLocation[]> {
  const result = new Map<string, FileLocation[]>();
  const lines = content.split("\n");
  const relPath = relative(rootDir, filePath);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const pattern of ENV_PATTERNS) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(line)) !== null) {
        const varName = match[1];
        const locations = result.get(varName) ?? [];
        locations.push({ file: relPath, line: i + 1, context: line.trim() });
        result.set(varName, locations);
      }
    }
  }

  return result;
}

/**
 * Detect env var usage in code without requiring a schema.
 * Returns a map of variable names to their file locations (with context).
 */
export function detectEnvVarsInCode(
  rootDir: string,
  options?: { exclude?: string[] },
): Record<string, FileLocation[]> {
  const exclude = options?.exclude ?? DEFAULT_EXCLUDE;
  const files = collectFiles(rootDir, exclude);
  const allLocations: Record<string, FileLocation[]> = {};

  for (const file of files) {
    const content = readFileSync(file, "utf-8");
    const fileLocations = extractEnvVarsWithLocations(content, file, rootDir);
    for (const [varName, locations] of fileLocations) {
      if (!allLocations[varName]) {
        allLocations[varName] = [];
      }
      allLocations[varName].push(...locations);
    }
  }

  return allLocations;
}

export function detectEnvUsage(
  rootDir: string,
  schema: EnvSchema,
  options?: { exclude?: string[] },
): DetectionResult {
  const exclude = options?.exclude ?? DEFAULT_EXCLUDE;
  const files = collectFiles(rootDir, exclude);
  const usedInCode = new Set<string>();
  const allLocations: Record<string, FileLocation[]> = {};

  for (const file of files) {
    const content = readFileSync(file, "utf-8");
    const fileLocations = extractEnvVarsWithLocations(content, file, rootDir);
    for (const [varName, locations] of fileLocations) {
      usedInCode.add(varName);
      if (!allLocations[varName]) {
        allLocations[varName] = [];
      }
      allLocations[varName].push(...locations);
    }
  }

  const schemaVars = new Set(Object.keys(schema.variables));

  const inSchemaNotUsed = [...schemaVars].filter((v) => !usedInCode.has(v));
  const usedNotInSchema = [...usedInCode].filter((v) => !schemaVars.has(v));

  return {
    usedInCode: [...usedInCode].sort(),
    inSchemaNotUsed: inSchemaNotUsed.sort(),
    usedNotInSchema: usedNotInSchema.sort(),
    locations: allLocations,
  };
}
