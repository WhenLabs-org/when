import * as path from "node:path";

/**
 * File-naming convention extractor. Looks at basenames (sans extension)
 * and categorizes each one into a naming style, then picks the dominant
 * style.
 *
 * Files that live in a `components/` directory — or whose basename
 * starts with a capital letter in a React context — are scored
 * separately as "component naming", which conventionally differs from
 * the rest of the project's utilities (PascalCase components vs
 * kebab-case routes is a near-universal pattern).
 */

export type NamingStyle =
  | "kebab-case"
  | "snake_case"
  | "camelCase"
  | "PascalCase"
  | "mixed";

export interface NamingExtraction {
  /** Dominant style for general source files. */
  files: NamingStyle;
  /** Dominant style for files in component directories (React/Vue). */
  components: NamingStyle | null;
  /** 0..1 — fraction of sampled files matching the dominant style. */
  confidence: number;
  /** How many files went into the dominant-style vote. */
  sampleSize: number;
  /** Up to 3 example paths demonstrating the chosen style. */
  examples: string[];
}

const CONFIDENCE_THRESHOLD = 0.7;

const STYLE_PATTERNS: Array<{ style: NamingStyle; regex: RegExp }> = [
  { style: "kebab-case", regex: /^[a-z0-9]+(?:-[a-z0-9]+)+$/ },
  { style: "snake_case", regex: /^[a-z0-9]+(?:_[a-z0-9]+)+$/ },
  { style: "PascalCase", regex: /^[A-Z][a-zA-Z0-9]*$/ },
  { style: "camelCase", regex: /^[a-z][a-zA-Z0-9]*$/ },
];

/**
 * Classify a single basename into a naming style, or `null` if it
 * doesn't cleanly match any (e.g. `index`, `README`, single-word
 * lowercase like `utils` which is ambiguous between kebab and camel).
 * We deliberately skip ambiguous single-token names instead of voting
 * them into one bucket; they'd bias the count toward whichever comes
 * first in `STYLE_PATTERNS`.
 */
export function classifyBasename(basename: string): NamingStyle | null {
  // Strip extension(s). `foo.test.ts` → `foo` so the classification
  // reflects the author's intent for the file name.
  let name = basename;
  // Drop the last extension first, then any secondary like `.test`.
  const firstDot = name.lastIndexOf(".");
  if (firstDot > 0) name = name.slice(0, firstDot);
  const secondDot = name.lastIndexOf(".");
  if (secondDot > 0) name = name.slice(0, secondDot);

  if (name.length === 0) return null;

  // Single-token names are ambiguous between conventions:
  //   - `utils` could be camelCase or kebab-case (one segment)
  //   - `Button` could be PascalCase (component) or just "capitalized
  //     route file" like Next.js `Index.tsx`
  // We only classify a single-token name as PascalCase when the caller
  // has already separated it into a component bucket (see
  // `extractNaming` — it routes files in components/ dirs to the
  // component vote, where a single capitalized token is unambiguously
  // PascalCase). Here, we stay conservative and return null.
  if (!/[-_A-Z]/.test(name.slice(1))) {
    return null;
  }

  for (const { style, regex } of STYLE_PATTERNS) {
    if (regex.test(name)) return style;
  }
  return null;
}

/**
 * Like `classifyBasename`, but treats a single-token capitalized name
 * (e.g. `Button`) as PascalCase. Used only for files in component
 * buckets where that interpretation is unambiguous.
 */
function classifyComponentBasename(basename: string): NamingStyle | null {
  const general = classifyBasename(basename);
  if (general !== null) return general;

  let name = basename;
  const firstDot = name.lastIndexOf(".");
  if (firstDot > 0) name = name.slice(0, firstDot);
  if (/^[A-Z][a-zA-Z0-9]*$/.test(name)) return "PascalCase";
  return null;
}

/**
 * Classify every file, vote for the dominant style, report confidence
 * as the vote share. Files in `components/` are bucketed separately.
 *
 * Callers should ignore the extraction when `confidence < 0.7` — that's
 * the threshold below which extractors return "unknown" and the scan
 * pipeline falls back to framework defaults.
 */
export function extractNaming(sourceFiles: string[]): NamingExtraction {
  const generalVotes = new Map<NamingStyle, number>();
  const componentVotes = new Map<NamingStyle, number>();
  const generalExamples: Record<NamingStyle, string[]> = emptyExamples();
  const componentExamples: Record<NamingStyle, string[]> = emptyExamples();

  for (const relPath of sourceFiles) {
    const basename = path.posix.basename(relPath);
    const isComponent = isComponentPath(relPath);

    // Component bucket gets the permissive classifier that accepts a
    // single-token capitalized name as PascalCase; everywhere else
    // uses the strict version that skips those as ambiguous (otherwise
    // Next.js route files like `Index.tsx` bias the general bucket).
    const style = isComponent
      ? classifyComponentBasename(basename)
      : classifyBasename(basename);
    if (!style) continue;

    if (isComponent) {
      componentVotes.set(style, (componentVotes.get(style) ?? 0) + 1);
      if (componentExamples[style].length < 3) componentExamples[style].push(relPath);
    } else {
      generalVotes.set(style, (generalVotes.get(style) ?? 0) + 1);
      if (generalExamples[style].length < 3) generalExamples[style].push(relPath);
    }
  }

  const generalResult = pickDominant(generalVotes);
  const componentResult = pickDominant(componentVotes);

  const dominantStyle: NamingStyle =
    generalResult?.style ?? "mixed";
  const examples =
    generalResult && generalExamples[dominantStyle as NamingStyle]
      ? generalExamples[dominantStyle as NamingStyle]
      : [];

  return {
    files: dominantStyle,
    components:
      componentResult && componentResult.confidence >= CONFIDENCE_THRESHOLD
        ? componentResult.style
        : null,
    confidence: generalResult?.confidence ?? 0,
    sampleSize: generalResult?.sampleSize ?? 0,
    examples,
  };
}

function pickDominant(
  votes: Map<NamingStyle, number>,
): { style: NamingStyle; confidence: number; sampleSize: number } | null {
  let total = 0;
  let best: { style: NamingStyle; count: number } | null = null;
  for (const [style, count] of votes) {
    total += count;
    if (!best || count > best.count) best = { style, count };
  }
  if (!best || total === 0) return null;
  return {
    style: best.style,
    confidence: best.count / total,
    sampleSize: total,
  };
}

function isComponentPath(relPath: string): boolean {
  const lower = relPath.toLowerCase();
  return (
    lower.includes("/components/") ||
    lower.includes("/ui/") ||
    lower.startsWith("components/") ||
    lower.startsWith("ui/")
  );
}

function emptyExamples(): Record<NamingStyle, string[]> {
  return {
    "kebab-case": [],
    "snake_case": [],
    camelCase: [],
    PascalCase: [],
    mixed: [],
  };
}

export { CONFIDENCE_THRESHOLD as NAMING_CONFIDENCE_THRESHOLD };
