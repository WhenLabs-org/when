import * as path from "node:path";
import fg from "fast-glob";
import { readFile } from "../utils/fs.js";

/**
 * Pick a representative sample of the project's source files for the
 * convention extractors. Constraints:
 *
 *   - Honor `.gitignore` (parsed directly; fast-glob doesn't read it
 *     natively) plus a hard-coded set of universal build-output dirs.
 *   - Cap at ~200 total files (across source and test buckets).
 *     Applied via fast-glob's streaming interface so we never walk
 *     more of the filesystem than we have to — large monorepos
 *     shouldn't pay the full-walk tax on every `init` / `sync`.
 *   - Stratify: partition files into `source` (production code) and
 *     `test` (test code) buckets. Naming/layout extractors want source;
 *     the test-layout extractor wants tests.
 *
 * Extraction is heuristic. AST parsing is out of scope — the goal is
 * "pretty sure" signals with explicit confidence, not perfect answers.
 */

export interface SampledFiles {
  /** Source files (production code). Used by naming/layout extractors. */
  source: string[];
  /** Test files. Used by the test-layout extractor. */
  test: string[];
  /** Total file count across both buckets. */
  total: number;
}

// Source-code globs we care about. Keep this tight so the sample is
// representative of what the AI will actually work in.
const SOURCE_GLOBS = [
  "**/*.ts",
  "**/*.tsx",
  "**/*.js",
  "**/*.jsx",
  "**/*.mjs",
  "**/*.cjs",
  "**/*.py",
  "**/*.rs",
  "**/*.go",
  "**/*.vue",
  "**/*.svelte",
];

// Test-file recognition: a file is a test if its path contains one of
// these patterns. Used to partition the sampled files.
const TEST_PATH_PATTERNS = [
  /(^|\/)tests?(\/|$)/i,
  /__tests__[\\/]/,
  /\.test\.[a-z]+$/i,
  /\.spec\.[a-z]+$/i,
  /_test\.[a-z]+$/i,
];

const BASE_IGNORE = [
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/out/**",
  "**/.next/**",
  "**/.nuxt/**",
  "**/.turbo/**",
  "**/.svelte-kit/**",
  "**/.output/**",
  "**/coverage/**",
  "**/.git/**",
  "**/.husky/**",
  "**/target/**", // Rust
  "**/__pycache__/**",
  "**/*.min.*",
];

export interface SampleOptions {
  /** Max files across source + test buckets. Default 200. */
  limit?: number;
}

export async function sampleProjectFiles(
  projectRoot: string,
  options: SampleOptions = {},
): Promise<SampledFiles> {
  const limit = options.limit ?? 200;
  // Budget: 80% source / 20% test so naming/layout signals aren't
  // starved by a test-heavy repo.
  const sourceCap = Math.floor(limit * 0.8);
  const testCap = limit - sourceCap;

  const ignore = [...BASE_IGNORE, ...(await readGitignore(projectRoot))];

  const source: string[] = [];
  const test: string[] = [];

  // Stream the globwalk so we stop as soon as both buckets are full.
  // On a 50k-file monorepo this is the difference between milliseconds
  // and seconds.
  const stream = fg.stream(SOURCE_GLOBS, {
    cwd: projectRoot,
    dot: false,
    onlyFiles: true,
    ignore,
  });

  for await (const chunk of stream as AsyncIterable<string | Buffer>) {
    const rel = typeof chunk === "string" ? chunk : chunk.toString("utf-8");
    const normalized = normalizeSep(rel);
    if (isTestPath(normalized)) {
      if (test.length < testCap) test.push(normalized);
    } else if (source.length < sourceCap) {
      source.push(normalized);
    }
    if (source.length >= sourceCap && test.length >= testCap) break;
  }

  return { source, test, total: source.length + test.length };
}

export function isTestPath(relPath: string): boolean {
  return TEST_PATH_PATTERNS.some((re) => re.test(relPath));
}

/**
 * Read the project's top-level `.gitignore` and translate each entry
 * into a fast-glob pattern. Deliberately conservative: we only parse
 * the most common forms (directory names, extensions, exact paths)
 * and skip anything with `!` negation — getting gitignore semantics
 * exactly right requires a real parser, and the failure mode of
 * "scanned too much" is just a slower extraction, not a correctness
 * bug.
 */
async function readGitignore(projectRoot: string): Promise<string[]> {
  const content = await readFile(path.join(projectRoot, ".gitignore"));
  if (!content) return [];

  const patterns: string[] = [];
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith("!")) continue;

    // Strip leading slash — fast-glob globs are project-root-relative
    // anyway, and gitignore's leading-slash means "repo root".
    const entry = line.replace(/^\//, "").replace(/\/$/, "");
    if (!entry) continue;

    // Directory-like pattern (no wildcards, no extension separator).
    if (!entry.includes("*") && !entry.includes(".")) {
      patterns.push(`**/${entry}/**`);
    } else {
      patterns.push(`**/${entry}`);
    }
  }
  return patterns;
}

function normalizeSep(p: string): string {
  return p.split(path.sep).join("/");
}
