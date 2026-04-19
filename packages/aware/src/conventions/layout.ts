/**
 * Directory-layout extractor. Identifies broad organizational patterns
 * so the AI's generated guidance reflects what the project actually
 * looks like.
 *
 * Patterns recognized:
 *   - feature-sliced   — top-level `features/` or `entities/` dirs
 *                        (Feature-Sliced Design / domain-modeled layout)
 *   - atomic-design    — `atoms/`, `molecules/`, `organisms/` under src
 *   - route-based      — Next/Remix/SvelteKit `pages/` or `app/` as
 *                        the primary organization unit
 *   - component-based  — `components/` at the top, flat sibling dirs
 *                        like `lib/`, `utils/`, `hooks/`
 *   - flat             — only `src/` with files directly under it
 *
 * This is heuristic: projects routinely mix patterns. The extractor
 * returns a confidence score derived from how many anchor directories
 * match; callers suppress the result below 0.7.
 */

export type LayoutPattern =
  | "feature-sliced"
  | "atomic-design"
  | "route-based"
  | "component-based"
  | "flat"
  | "mixed";

export interface LayoutExtraction {
  pattern: LayoutPattern;
  confidence: number;
  /** Which directories the extractor found evidence of. */
  evidence: string[];
}

const CONFIDENCE_THRESHOLD = 0.7;

export function extractLayout(sourceFiles: string[]): LayoutExtraction {
  const dirs = collectDirectories(sourceFiles);
  const evidence: string[] = [];
  const scores = new Map<LayoutPattern, { score: number; evidence: string[] }>();

  function bump(pattern: LayoutPattern, weight: number, ev: string): void {
    const current = scores.get(pattern) ?? { score: 0, evidence: [] };
    current.score += weight;
    if (!current.evidence.includes(ev)) current.evidence.push(ev);
    scores.set(pattern, current);
  }

  // Feature-sliced signals
  if (dirs.has("src/features") || dirs.has("features")) {
    bump("feature-sliced", 2, "features/");
  }
  if (dirs.has("src/entities") || dirs.has("entities")) {
    bump("feature-sliced", 2, "entities/");
  }
  if (dirs.has("src/shared") && (dirs.has("src/features") || dirs.has("src/entities"))) {
    bump("feature-sliced", 1, "shared/");
  }

  // Atomic-design signals
  for (const anchor of ["atoms", "molecules", "organisms"]) {
    if (dirs.has(anchor) || dirs.has(`src/${anchor}`)) {
      bump("atomic-design", 2, `${anchor}/`);
    }
  }

  // Route-based signals weigh heavily: `app/` or `pages/` with route
  // files inside is a near-definitive Next/Remix/SvelteKit pattern, and
  // those projects almost always also have a `components/` sibling —
  // so the component-based signal must not outvote route-based.
  if (dirs.has("app") || dirs.has("src/app")) {
    bump("route-based", 3, "app/");
  }
  if (dirs.has("pages") || dirs.has("src/pages")) {
    bump("route-based", 3, "pages/");
  }
  if (dirs.has("routes") || dirs.has("src/routes")) {
    bump("route-based", 3, "routes/");
  }

  // Component-based signals pull weakly — many projects have
  // `components/` regardless of their broader pattern, so this should
  // lose to a stronger route-based / feature-sliced signal when both
  // are present.
  if (dirs.has("components") || dirs.has("src/components")) {
    bump("component-based", 1, "components/");
  }
  if (dirs.has("src/hooks")) bump("component-based", 0.5, "hooks/");
  if (dirs.has("src/lib") || dirs.has("lib")) bump("component-based", 0.5, "lib/");

  // Flat: `src/` exists but has no nested directories worth noting.
  // Checked only if no other pattern scored.
  if (dirs.has("src") && scores.size === 0) {
    bump("flat", 1, "src/");
  }

  let total = 0;
  let best: { pattern: LayoutPattern; score: number; evidence: string[] } | null = null;
  for (const [pattern, { score, evidence: ev }] of scores) {
    total += score;
    if (!best || score > best.score) best = { pattern, score, evidence: ev };
  }

  if (!best || total === 0) {
    return { pattern: "mixed", confidence: 0, evidence };
  }

  const confidence = best.score / total;
  return {
    pattern: confidence >= CONFIDENCE_THRESHOLD ? best.pattern : "mixed",
    confidence,
    evidence: best.evidence,
  };
}

function collectDirectories(files: string[]): Set<string> {
  const dirs = new Set<string>();
  for (const relPath of files) {
    const parts = relPath.split("/");
    // Register every ancestor path up to the file's parent.
    for (let i = 1; i <= parts.length - 1; i++) {
      dirs.add(parts.slice(0, i).join("/"));
    }
  }
  return dirs;
}

export { CONFIDENCE_THRESHOLD as LAYOUT_CONFIDENCE_THRESHOLD };
