import { describe, it, expect } from "vitest";
import {
  versionMatches,
  majorVersion,
  majorEq,
} from "../../src/fragments/common.js";
import type { StackItem } from "../../src/types.js";

function item(version: string | null): StackItem {
  return {
    name: "thing",
    version,
    variant: null,
    confidence: 1,
    detectedFrom: "test",
  };
}

describe("majorVersion", () => {
  it("parses a plain version", () => {
    expect(majorVersion(item("15.1.0"))).toBe(15);
  });

  it("strips caret / tilde prefixes", () => {
    expect(majorVersion(item("^14.0"))).toBe(14);
    expect(majorVersion(item("~13"))).toBe(13);
  });

  it("returns null for null item or unparseable version", () => {
    expect(majorVersion(null)).toBeNull();
    expect(majorVersion(item(null))).toBeNull();
    expect(majorVersion(item("next"))).toBeNull();
  });
});

describe("versionMatches", () => {
  it("* matches anything including null version", () => {
    expect(versionMatches(null, "*")).toBe(true);
    expect(versionMatches(item("15"), "*")).toBe(true);
  });

  it("exact major matches", () => {
    expect(versionMatches(item("15.0"), "15")).toBe(true);
    expect(versionMatches(item("14.9"), "15")).toBe(false);
  });

  it(">= and <= bounds", () => {
    expect(versionMatches(item("15"), ">=14")).toBe(true);
    expect(versionMatches(item("13"), ">=14")).toBe(false);
    expect(versionMatches(item("14"), "<=14")).toBe(true);
  });

  it("space-separated bounds are ANDed", () => {
    expect(versionMatches(item("15"), ">=14 <16")).toBe(true);
    expect(versionMatches(item("16"), ">=14 <16")).toBe(false);
  });

  it("|| is ORed across clauses", () => {
    expect(versionMatches(item("14"), "14 || 15")).toBe(true);
    expect(versionMatches(item("13"), "14 || 15")).toBe(false);
  });

  it("majorEq", () => {
    expect(majorEq(item("15.3"), 15)).toBe(true);
    expect(majorEq(item("14"), 15)).toBe(false);
  });

  it("handles pre-release suffixes by major", () => {
    expect(majorVersion(item("15.0.0-rc.1"))).toBe(15);
    expect(versionMatches(item("15.0.0-rc.1"), ">=15")).toBe(true);
  });

  it("handles 0.x versions correctly", () => {
    expect(majorVersion(item("0.34.1"))).toBe(0);
    expect(versionMatches(item("0.34.1"), "0")).toBe(true);
    expect(versionMatches(item("0.34.1"), ">=1")).toBe(false);
    expect(versionMatches(item("1.0.0"), ">=1")).toBe(true);
  });
});
