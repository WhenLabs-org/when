import { describe, it, expect } from "vitest";
import { trimFragment } from "../../src/generators/copilot.js";

describe("trimFragment", () => {
  it("drops a ### subsection heading whose body was fully trimmed away", () => {
    const input = [
      "## Tool",
      "",
      "### First",
      "- a",
      "- b",
      "- c",
      "- d",
      "- e",
      "",
      "### Second",
      "- x",
      "- y",
      "",
      "### Third",
      "- z",
    ].join("\n");

    const output = trimFragment(input, 5);

    expect(output).toContain("### First");
    expect(output).not.toContain("### Second");
    expect(output).not.toContain("### Third");
  });

  it("keeps a subsection heading when at least one bullet survives under it", () => {
    const input = [
      "## Tool",
      "",
      "### First",
      "- a",
      "- b",
      "",
      "### Second",
      "- c",
      "- d",
      "- e",
    ].join("\n");

    const output = trimFragment(input, 5);

    expect(output).toContain("### First");
    expect(output).toContain("### Second");
    expect(output).toContain("- e");
  });

  it("leaves a fragment unchanged when all bullets fit within the budget", () => {
    const input = [
      "## Small",
      "",
      "### Only",
      "- a",
      "- b",
    ].join("\n");

    expect(trimFragment(input, 5)).toBe(input);
  });

  it("returns an empty string for empty input", () => {
    expect(trimFragment("", 5)).toBe("");
  });
});
