import { describe, it, expect } from "vitest";
import { JsonReporter } from "../../src/reporters/json.js";
import { MarkdownReporter } from "../../src/reporters/markdown.js";
import type { ValidationResult, DiffResult } from "../../src/schema/types.js";

const validResult: ValidationResult = {
  valid: true,
  issues: [],
  stats: { total: 3, valid: 3, errors: 0, warnings: 0, missing: 0 },
};

const failResult: ValidationResult = {
  valid: false,
  issues: [
    { variable: "PORT", severity: "error", message: "Missing required variable", expected: "integer" },
    { variable: "UNKNOWN", severity: "warning", message: "Not in schema" },
  ],
  stats: { total: 3, valid: 2, errors: 1, warnings: 1, missing: 1 },
};

const diffResult: DiffResult = {
  source: ".env",
  target: ".env.prod",
  entries: [
    { variable: "PORT", status: "changed", sourceValue: "3000", targetValue: "8080", inSchema: true, required: true },
    { variable: "DEBUG", status: "removed", inSchema: false, required: false },
  ],
};

describe("JsonReporter", () => {
  const reporter = new JsonReporter();

  it("outputs valid JSON for validation", () => {
    const output = reporter.reportValidation(validResult);
    const parsed = JSON.parse(output);
    expect(parsed.valid).toBe(true);
    expect(parsed.stats.total).toBe(3);
  });

  it("outputs valid JSON for diff", () => {
    const output = reporter.reportDiff(diffResult);
    const parsed = JSON.parse(output);
    expect(parsed.entries).toHaveLength(2);
  });
});

describe("MarkdownReporter", () => {
  const reporter = new MarkdownReporter();

  it("outputs pass header for valid result", () => {
    const output = reporter.reportValidation(validResult);
    expect(output).toContain("Passed");
  });

  it("outputs fail header for failed result", () => {
    const output = reporter.reportValidation(failResult);
    expect(output).toContain("Failed");
    expect(output).toContain("`PORT`");
  });

  it("outputs markdown table for diff", () => {
    const output = reporter.reportDiff(diffResult);
    expect(output).toContain("| Status |");
    expect(output).toContain("`PORT`");
  });
});
