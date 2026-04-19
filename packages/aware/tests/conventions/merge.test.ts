import { describe, it, expect } from "vitest";
import { mergeConventionsForInit } from "../../src/scan.js";
import type {
  ConventionsConfig,
  ExtractedConventions,
} from "../../src/types.js";

describe("mergeConventionsForInit", () => {
  it("returns defaults unchanged when extracted has nothing", () => {
    const defaults: ConventionsConfig = {
      naming: { files: "kebab-case", functions: "camelCase" },
    };
    const extracted: ExtractedConventions = {
      _sampleSize: 0,
      _confidence: { naming: 0, tests: 0, layout: 0 },
    };
    const merged = mergeConventionsForInit(defaults, extracted);
    expect(merged.naming).toEqual(defaults.naming);
    expect(merged.extracted).toBe(extracted);
  });

  it("extracted naming wins over default naming for overlapping keys", () => {
    const defaults: ConventionsConfig = {
      naming: { files: "kebab-case", functions: "camelCase" },
    };
    const extracted: ExtractedConventions = {
      naming: { files: "snake_case" },
      _sampleSize: 50,
      _confidence: { naming: 0.9, tests: 0, layout: 0 },
    };
    const merged = mergeConventionsForInit(defaults, extracted);
    expect(merged.naming?.files).toBe("snake_case");
    // Non-overlapping default keys survive.
    expect(merged.naming?.functions).toBe("camelCase");
  });

  it("extracted tests/layout flow into their slots without clobbering siblings", () => {
    const defaults: ConventionsConfig = {
      naming: { files: "kebab-case" },
      testing: { framework: "vitest" },
    };
    const extracted: ExtractedConventions = {
      tests: { layout: "colocated" },
      layout: { pattern: "route-based" } as unknown as ExtractedConventions["layout"],
      _sampleSize: 30,
      _confidence: { naming: 0, tests: 1, layout: 1 },
    };
    const merged = mergeConventionsForInit(defaults, extracted);
    expect(merged.testing?.framework).toBe("vitest");
    expect(merged.testing?.layout).toBe("colocated");
    expect(merged.components?.layout).toBe("route-based");
  });

  it("always stashes the full extracted payload under extracted", () => {
    const defaults: ConventionsConfig = {};
    const extracted: ExtractedConventions = {
      naming: { files: "kebab-case" },
      _sampleSize: 10,
      _confidence: { naming: 1, tests: 0, layout: 0 },
    };
    const merged = mergeConventionsForInit(defaults, extracted);
    expect(merged.extracted).toBe(extracted);
  });
});
