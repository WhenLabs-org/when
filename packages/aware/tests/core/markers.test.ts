import { describe, it, expect } from "vitest";
import {
  openMarker,
  closeMarker,
  wrapSection,
  parseSections,
  findSectionIssues,
  footerWithPlaceholder,
} from "../../src/core/markers.js";

describe("section markers", () => {
  it("openMarker/closeMarker produce matching HTML comments", () => {
    expect(openMarker("stack")).toBe("<!-- aware:section:stack -->");
    expect(closeMarker("stack")).toBe("<!-- aware:section:stack:end -->");
    expect(openMarker("stack", "custom")).toBe(
      "<!-- aware:section:stack custom -->",
    );
  });

  it("wrapSection returns empty string for empty body", () => {
    expect(wrapSection("stack", "")).toBe("");
  });

  it("wrapSection wraps body between markers", () => {
    const out = wrapSection("rules", "- use server components");
    expect(out).toContain(openMarker("rules"));
    expect(out).toContain(closeMarker("rules"));
    expect(out).toContain("- use server components");
  });

  it("parseSections finds all sections in order", () => {
    const doc = [
      wrapSection("project", "# Project: X"),
      wrapSection("stack", "## Tech Stack\n- Next.js"),
      wrapSection("fragment/nextjs-15", "## Next.js\n- Use app router"),
    ].join("\n\n");

    const parsed = parseSections(doc);
    expect(parsed.map((s) => s.id)).toEqual([
      "project",
      "stack",
      "fragment/nextjs-15",
    ]);
    expect(parsed[1]!.body).toContain("## Tech Stack");
  });

  it("parseSections flags custom sections", () => {
    const doc =
      `<!-- aware:section:rules custom -->\nhand-written\n<!-- aware:section:rules:end -->`;
    const parsed = parseSections(doc);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.custom).toBe(true);
    expect(parsed[0]!.body).toBe("hand-written");
  });

  it("handles ids containing dashes, dots, and slashes", () => {
    const doc = wrapSection("fragment/next-js-15.1", "body");
    const parsed = parseSections(doc);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.id).toBe("fragment/next-js-15.1");
  });

  it("footerWithPlaceholder contains the hash placeholder", () => {
    expect(footerWithPlaceholder()).toContain("__AWARE_HASH_PLACEHOLDER__");
  });
});

describe("findSectionIssues", () => {
  it("returns empty array for well-formed content", () => {
    const doc = [
      wrapSection("a", "one"),
      wrapSection("b", "two"),
    ].join("\n\n");
    expect(findSectionIssues(doc)).toEqual([]);
  });

  it("flags duplicate ids", () => {
    const doc = [
      wrapSection("a", "one"),
      wrapSection("a", "two"),
    ].join("\n\n");
    const issues = findSectionIssues(doc);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.kind).toBe("duplicate-id");
    expect(issues[0]!.id).toBe("a");
  });

  it("flags nested sections", () => {
    const doc =
      `<!-- aware:section:outer -->\n` +
      `some content\n` +
      `<!-- aware:section:inner -->\nnested\n<!-- aware:section:inner:end -->\n` +
      `<!-- aware:section:outer:end -->`;
    const issues = findSectionIssues(doc);
    expect(issues.some((i) => i.kind === "nested-section" && i.id === "inner")).toBe(
      true,
    );
  });

  it("flags orphan open markers", () => {
    const doc = `<!-- aware:section:lonely -->\nno close here`;
    const issues = findSectionIssues(doc);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.kind).toBe("orphan-open");
    expect(issues[0]!.id).toBe("lonely");
  });

  it("flags orphan close markers", () => {
    const doc = `<!-- aware:section:ghost:end -->`;
    const issues = findSectionIssues(doc);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.kind).toBe("orphan-close");
  });
});
