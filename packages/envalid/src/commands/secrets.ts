import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname, relative } from "node:path";

export interface SecretFinding {
  file: string;
  line: number;
  variable: string;
  pattern: string;
}

export interface SecretsResult {
  findings: SecretFinding[];
  filesScanned: number;
}

// Known API key prefixes
const API_KEY_PREFIXES = [
  "sk_live_",
  "sk_test_",
  "pk_live_",
  "pk_test_",
  "ghp_",
  "gho_",
  "ghu_",
  "ghs_",
  "ghr_",
  "github_pat_",
  "npm_",
  "AKIA",       // AWS access key
  "xox",        // Slack tokens (xoxb-, xoxp-, xoxs-)
  "sk-",        // OpenAI
  "SG.",        // SendGrid
  "hf_",        // Hugging Face
  "glpat-",     // GitLab
  "pypi-",      // PyPI
];

// Sensitive variable name patterns
const SENSITIVE_VAR_NAMES =
  /(?:SECRET|KEY|TOKEN|PASSWORD|CREDENTIAL|PRIVATE|AUTH)(?:_|$)/i;

// Base64 detection: 40+ chars of base64 alphabet
const BASE64_LONG = /[A-Za-z0-9+/=]{40,}/;

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
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
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
  ".yaml",
  ".yml",
  ".toml",
  ".cfg",
  ".ini",
  ".conf",
  ".json",
  ".xml",
]);

function collectFiles(
  dir: string,
  exclude: string[],
  files: string[] = [],
): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (exclude.includes(entry) || entry.startsWith(".")) continue;
    const fullPath = join(dir, entry);
    let stat;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      collectFiles(fullPath, exclude, files);
    } else if (SCANNABLE_EXTENSIONS.has(extname(entry))) {
      files.push(fullPath);
    }
  }
  return files;
}

// Assignment patterns: look for key=value, key: value, key = "value" etc.
const ASSIGNMENT_PATTERNS = [
  // JS/TS: const SECRET = "value" or let KEY = 'value'
  /(?:const|let|var|export)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*["'`]([^"'`]+)["'`]/g,
  // Object property: secret: "value" or secret: 'value'
  /([A-Za-z_][A-Za-z0-9_]*)\s*:\s*["'`]([^"'`]+)["'`]/g,
  // Python: SECRET = "value"
  /([A-Za-z_][A-Za-z0-9_]*)\s*=\s*["']([^"']+)["']/g,
  // Generic env-style: KEY=value (no quotes)
  /^([A-Za-z_][A-Za-z0-9_]*)=(.+)$/gm,
];

function scanLine(
  line: string,
  lineNum: number,
  relPath: string,
): SecretFinding[] {
  const findings: SecretFinding[] = [];

  // Check for known API key prefixes anywhere in the line
  for (const prefix of API_KEY_PREFIXES) {
    if (line.includes(prefix)) {
      // Try to find the variable name from assignment context
      const varName = extractVarName(line) ?? "(inline value)";
      findings.push({
        file: relPath,
        line: lineNum,
        variable: varName,
        pattern: `api_key_prefix:${prefix}`,
      });
      break; // one finding per line for prefix matches
    }
  }

  // Check assignment patterns for sensitive var names
  for (const pattern of ASSIGNMENT_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(line)) !== null) {
      const varName = match[1];
      const value = match[2];

      if (SENSITIVE_VAR_NAMES.test(varName) && value && value.length > 3) {
        // Avoid false positives for placeholder values
        if (isPlaceholder(value)) continue;
        findings.push({
          file: relPath,
          line: lineNum,
          variable: varName,
          pattern: "sensitive_var_name",
        });
      }

      // Check for long base64 strings in assignment context
      if (value && BASE64_LONG.test(value) && !isPlaceholder(value)) {
        findings.push({
          file: relPath,
          line: lineNum,
          variable: varName,
          pattern: "base64_long_string",
        });
      }
    }
  }

  return findings;
}

function extractVarName(line: string): string | null {
  // Try to find an assignment variable on this line
  const assignMatch = line.match(
    /(?:const|let|var|export)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/,
  );
  if (assignMatch) return assignMatch[1];

  const propMatch = line.match(/([A-Za-z_][A-Za-z0-9_]*)\s*[:=]/);
  if (propMatch) return propMatch[1];

  return null;
}

function isPlaceholder(value: string): boolean {
  const lower = value.toLowerCase();
  return (
    lower.startsWith("your_") ||
    lower.startsWith("<") ||
    lower.startsWith("${") ||
    lower === "changeme" ||
    lower === "replace_me" ||
    lower === "xxx" ||
    lower === "todo" ||
    /^placeholder/i.test(lower) ||
    /^\*+$/.test(value) ||
    lower.startsWith("example")
  );
}

export function scanSecrets(
  rootDir: string,
  options?: { exclude?: string[] },
): SecretsResult {
  const exclude = options?.exclude ?? DEFAULT_EXCLUDE;
  const files = collectFiles(rootDir, exclude);
  const findings: SecretFinding[] = [];

  // Deduplicate findings per file:line
  const seen = new Set<string>();

  for (const file of files) {
    const content = readFileSync(file, "utf-8");
    const relPath = relative(rootDir, file);
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const lineFindings = scanLine(lines[i], i + 1, relPath);
      for (const f of lineFindings) {
        const key = `${f.file}:${f.line}:${f.variable}:${f.pattern}`;
        if (!seen.has(key)) {
          seen.add(key);
          findings.push(f);
        }
      }
    }
  }

  return {
    findings,
    filesScanned: files.length,
  };
}
