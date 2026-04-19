import type { ExtractedConventions, NamingConventions } from "../types.js";
import {
  extractNaming,
  NAMING_CONFIDENCE_THRESHOLD,
  type NamingExtraction,
} from "./naming.js";
import { sampleProjectFiles } from "./sample.js";
import {
  extractTestLayout,
  TEST_LAYOUT_CONFIDENCE_THRESHOLD,
  type TestLayoutExtraction,
} from "./tests.js";
import {
  extractLayout,
  LAYOUT_CONFIDENCE_THRESHOLD,
  type LayoutExtraction,
} from "./layout.js";

/**
 * Orchestrate the per-aspect extractors and return a single
 * `ExtractedConventions` payload suitable for merging into
 * `config.conventions.extracted`.
 *
 * Each aspect is gated on its own confidence threshold. Below the
 * threshold the aspect is omitted entirely — callers fall back to
 * framework defaults rather than render noisy guidance from a
 * low-confidence signal.
 *
 * Extraction is heuristic and intentionally conservative: confident
 * silence beats shaky advice.
 */
export async function extractConventions(
  projectRoot: string,
): Promise<ExtractedConventions> {
  const sample = await sampleProjectFiles(projectRoot);

  const naming = extractNaming(sample.source);
  const tests = extractTestLayout(sample.test);
  const layout = extractLayout(sample.source);

  const extracted: ExtractedConventions = {
    _sampleSize: sample.total,
    _confidence: {
      naming: round(naming.confidence),
      tests: round(tests.confidence),
      layout: round(layout.confidence),
    },
  };

  const namingOutput = namingToConventions(naming);
  if (namingOutput) extracted.naming = namingOutput;

  const testsOutput = testsToConventions(tests);
  if (testsOutput) extracted.tests = testsOutput;

  const layoutOutput = layoutToConventions(layout);
  if (layoutOutput) extracted.layout = layoutOutput;

  return extracted;
}

function namingToConventions(
  extraction: NamingExtraction,
): NamingConventions | undefined {
  if (extraction.confidence < NAMING_CONFIDENCE_THRESHOLD) return undefined;
  const naming: NamingConventions = { files: extraction.files };
  if (extraction.components) naming.components = extraction.components;
  return naming;
}

function testsToConventions(
  extraction: TestLayoutExtraction,
): Record<string, string> | undefined {
  if (extraction.confidence < TEST_LAYOUT_CONFIDENCE_THRESHOLD) return undefined;
  return { layout: extraction.layout };
}

function layoutToConventions(
  extraction: LayoutExtraction,
): Record<string, string> | undefined {
  if (extraction.confidence < LAYOUT_CONFIDENCE_THRESHOLD) return undefined;
  return {
    pattern: extraction.pattern,
    evidence: extraction.evidence.join(", "),
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

// Re-export the per-aspect extractors for fine-grained callers / tests.
export { extractNaming, extractTestLayout, extractLayout, sampleProjectFiles };
