import * as path from "node:path";

/**
 * Test-layout extractor. Where does this project keep its tests?
 * AI tools frequently guess wrong (colocated vs separate dir), so even
 * a single confident signal here is high-value.
 *
 * Three canonical layouts:
 *   - `colocated`       — `foo.test.ts` sits next to `foo.ts`
 *   - `__tests__`       — `src/foo/__tests__/foo.test.ts`
 *   - `separate-dir`    — `tests/foo.test.ts` or `test/foo.test.ts`
 *                         with the repo's source living elsewhere
 *
 * The extractor votes across every test file in the sample, then picks
 * the dominant layout. Mixed layouts (common in older repos) report low
 * confidence, and the scan pipeline skips the extraction when
 * confidence drops below the threshold.
 */

export type TestLayout = "colocated" | "__tests__" | "separate-dir" | "mixed";

export interface TestLayoutExtraction {
  layout: TestLayout;
  /** 0..1 — fraction of sampled test files matching the dominant layout. */
  confidence: number;
  /** Number of test files that went into the vote. */
  sampleSize: number;
  examples: string[];
}

const CONFIDENCE_THRESHOLD = 0.7;

const SEPARATE_DIR_PATTERNS = [
  /^tests\//,
  /^test\//,
  /^__tests__\//,
  /^e2e\//,
  /^spec\//,
];

export function extractTestLayout(testFiles: string[]): TestLayoutExtraction {
  const votes = new Map<TestLayout, number>();
  const examples = new Map<TestLayout, string[]>();

  for (const relPath of testFiles) {
    const layout = classifyTestPath(relPath);
    if (!layout) continue;
    votes.set(layout, (votes.get(layout) ?? 0) + 1);
    const list = examples.get(layout) ?? [];
    if (list.length < 3) list.push(relPath);
    examples.set(layout, list);
  }

  let total = 0;
  let best: { layout: TestLayout; count: number } | null = null;
  for (const [layout, count] of votes) {
    total += count;
    if (!best || count > best.count) best = { layout, count };
  }

  if (!best || total === 0) {
    return { layout: "mixed", confidence: 0, sampleSize: 0, examples: [] };
  }

  const confidence = best.count / total;
  return {
    layout: confidence >= CONFIDENCE_THRESHOLD ? best.layout : "mixed",
    confidence,
    sampleSize: total,
    examples: examples.get(best.layout) ?? [],
  };
}

export function classifyTestPath(relPath: string): TestLayout | null {
  const normalized = relPath.split(path.sep).join("/");

  if (normalized.includes("/__tests__/")) return "__tests__";
  if (SEPARATE_DIR_PATTERNS.some((re) => re.test(normalized))) {
    return "separate-dir";
  }
  // Has `.test.` / `.spec.` / `_test.` in the basename and isn't under
  // a dedicated test directory → colocated.
  const basename = path.posix.basename(normalized);
  if (/\.(test|spec)\.[a-z]+$/i.test(basename) || /_test\.[a-z]+$/i.test(basename)) {
    return "colocated";
  }
  return null;
}

export { CONFIDENCE_THRESHOLD as TEST_LAYOUT_CONFIDENCE_THRESHOLD };
