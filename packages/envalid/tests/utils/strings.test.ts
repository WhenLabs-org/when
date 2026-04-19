import { describe, it, expect } from "vitest";
import { levenshtein, closestMatch } from "../../src/utils/strings.js";

describe("levenshtein", () => {
  it("returns 0 for equal strings", () => {
    expect(levenshtein("foo", "foo")).toBe(0);
  });
  it("returns length when one side is empty", () => {
    expect(levenshtein("", "foo")).toBe(3);
    expect(levenshtein("bar", "")).toBe(3);
  });
  it("measures edits", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
    expect(levenshtein("DB_URL", "DB_URI")).toBe(1);
  });
});

describe("closestMatch", () => {
  it("returns undefined when no candidate is within distance", () => {
    expect(closestMatch("foo", ["xyzzy", "quux"])).toBeUndefined();
  });
  it("finds a close match", () => {
    expect(closestMatch("DB_URI", ["DB_URL", "PORT", "NODE_ENV"])).toBe("DB_URL");
  });
  it("honors maxDistance", () => {
    expect(closestMatch("foo", ["foobarbaz"], 2)).toBeUndefined();
  });
});
