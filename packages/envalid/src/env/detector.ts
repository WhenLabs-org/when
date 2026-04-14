import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import type { EnvSchema } from "../schema/types.js";

export interface DetectionResult {
  usedInCode: string[];
  inSchemaNotUsed: string[];
  usedNotInSchema: string[];
}

// Patterns that reference env vars across languages/frameworks
const ENV_PATTERNS = [
  // JavaScript/TypeScript: process.env.VAR_NAME or process.env["VAR_NAME"]
  /process\.env\.([A-Z][A-Z0-9_]*)/g,
  /process\.env\["([A-Z][A-Z0-9_]*)"\]/g,
  /process\.env\['([A-Z][A-Z0-9_]*)'\]/g,

  // Vite/Astro: import.meta.env.VAR_NAME
  /import\.meta\.env\.([A-Z][A-Z0-9_]*)/g,

  // Python: os.environ["VAR"] or os.environ.get("VAR") or os.getenv("VAR")
  /os\.environ\["([A-Z][A-Z0-9_]*)"\]/g,
  /os\.environ\['([A-Z][A-Z0-9_]*)'\]/g,
  /os\.environ\.get\(["']([A-Z][A-Z0-9_]*)["']/g,
  /os\.getenv\(["']([A-Z][A-Z0-9_]*)["']/g,

  // Ruby: ENV["VAR"] or ENV['VAR'] or ENV.fetch("VAR")
  /ENV\["([A-Z][A-Z0-9_]*)"\]/g,
  /ENV\['([A-Z][A-Z0-9_]*)'\]/g,
  /ENV\.fetch\(["']([A-Z][A-Z0-9_]*)["']/g,

  // Go: os.Getenv("VAR")
  /os\.Getenv\("([A-Z][A-Z0-9_]*)"\)/g,

  // Rust: std::env::var("VAR") or env::var("VAR")
  /env::var\("([A-Z][A-Z0-9_]*)"\)/g,

  // PHP: getenv("VAR") or $_ENV["VAR"]
  /getenv\(["']([A-Z][A-Z0-9_]*)["']\)/g,
  /\$_ENV\["([A-Z][A-Z0-9_]*)"\]/g,
  /\$_ENV\['([A-Z][A-Z0-9_]*)'\]/g,
];

const DEFAULT_EXCLUDE = [
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".next",
  ".nuxt",
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
    // Reset lastIndex for each file
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      vars.add(match[1]);
    }
  }
  return vars;
}

export function detectEnvUsage(
  rootDir: string,
  schema: EnvSchema,
  options?: { exclude?: string[] },
): DetectionResult {
  const exclude = options?.exclude ?? DEFAULT_EXCLUDE;
  const files = collectFiles(rootDir, exclude);
  const usedInCode = new Set<string>();

  for (const file of files) {
    const content = readFileSync(file, "utf-8");
    const vars = extractEnvVars(content);
    for (const v of vars) {
      usedInCode.add(v);
    }
  }

  const schemaVars = new Set(Object.keys(schema.variables));

  const inSchemaNotUsed = [...schemaVars].filter((v) => !usedInCode.has(v));
  const usedNotInSchema = [...usedInCode].filter((v) => !schemaVars.has(v));

  return {
    usedInCode: [...usedInCode].sort(),
    inSchemaNotUsed: inSchemaNotUsed.sort(),
    usedNotInSchema: usedNotInSchema.sort(),
  };
}
