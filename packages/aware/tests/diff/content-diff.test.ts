import { describe, it, expect, beforeEach } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  computeContentDrift,
  diffSections,
} from "../../src/diff/content-diff.js";
import { stampHash } from "../../src/core/hash.js";
import { footerWithPlaceholder, wrapSection } from "../../src/core/markers.js";
import type { GeneratorResult } from "../../src/types.js";

function stamped(body: string): string {
  return stampHash(body + "\n\n" + footerWithPlaceholder());
}

function makeResult(filePath: string, body: string): GeneratorResult {
  const content = stamped(body);
  return {
    target: "claude",
    filePath,
    content,
    sections: 1,
  };
}

describe("computeContentDrift", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "aware-content-diff-"));
  });

  it("returns [] when disk file matches expected", async () => {
    const result = makeResult("CLAUDE.md", wrapSection("stack", "# stack"));
    await fs.writeFile(path.join(tmp, "CLAUDE.md"), result.content);
    const drifts = await computeContentDrift(tmp, [result]);
    expect(drifts).toEqual([]);
  });

  it("flags a missing file", async () => {
    const result = makeResult("CLAUDE.md", wrapSection("stack", "# stack"));
    const drifts = await computeContentDrift(tmp, [result]);
    expect(drifts).toHaveLength(1);
    expect(drifts[0]!.kind).toBe("missing");
  });

  it("flags an unmanaged file (no hash marker)", async () => {
    const result = makeResult("CLAUDE.md", wrapSection("stack", "# stack"));
    await fs.writeFile(
      path.join(tmp, "CLAUDE.md"),
      "# hand-written no marker here",
    );
    const drifts = await computeContentDrift(tmp, [result]);
    expect(drifts).toHaveLength(1);
    expect(drifts[0]!.kind).toBe("unmanaged");
  });

  it("flags a tampered file (hash does not self-verify)", async () => {
    const result = makeResult("CLAUDE.md", wrapSection("stack", "# stack"));
    const tampered = result.content.replace("# stack", "# STACK EDITED");
    await fs.writeFile(path.join(tmp, "CLAUDE.md"), tampered);
    const drifts = await computeContentDrift(tmp, [result]);
    expect(drifts).toHaveLength(1);
    expect(drifts[0]!.kind).toBe("tampered");
  });

  it("flags an outdated file (self-verifies but regeneration differs)", async () => {
    // Simulate a previous sync: disk has an older stamped file.
    const oldResult = makeResult("CLAUDE.md", wrapSection("stack", "# old"));
    await fs.writeFile(path.join(tmp, "CLAUDE.md"), oldResult.content);

    // New sync would produce something different.
    const newResult = makeResult("CLAUDE.md", wrapSection("stack", "# new"));
    const drifts = await computeContentDrift(tmp, [newResult]);
    expect(drifts).toHaveLength(1);
    expect(drifts[0]!.kind).toBe("outdated");
    expect(drifts[0]!.sections).toBeDefined();
    expect(drifts[0]!.sections!.some((s) => s.kind === "changed")).toBe(true);
  });

  it("section attribution reports added/removed sections", () => {
    const oldOut = wrapSection("a", "one");
    const newOut = [wrapSection("a", "one"), wrapSection("b", "two")].join(
      "\n\n",
    );
    const sections = diffSections(oldOut, newOut);
    expect(sections.find((s) => s.id === "b")?.kind).toBe("added");

    const reverse = diffSections(newOut, oldOut);
    expect(reverse.find((s) => s.id === "b")?.kind).toBe("removed");
  });

  it("section attribution degrades to empty when one side lacks markers", () => {
    const withSections = wrapSection("a", "one");
    const plainText = "just a plain markdown file";
    // Neither direction should throw; both should return an empty array
    // so the file-level verdict carries the message.
    expect(diffSections(plainText, withSections)).toEqual([]);
    expect(diffSections(withSections, plainText)).toEqual([]);
  });

  it("flags a stale file when its target is disabled", async () => {
    await fs.writeFile(
      path.join(tmp, "AGENTS.md"),
      "# some generated-looking content",
    );
    const drifts = await computeContentDrift(tmp, [], {
      disabled: [{ target: "agents", filePath: "AGENTS.md" }],
    });
    expect(drifts).toHaveLength(1);
    expect(drifts[0]!.kind).toBe("stale");
    expect(drifts[0]!.target).toBe("agents");
  });

  it("does not flag a disabled target whose file is absent", async () => {
    const drifts = await computeContentDrift(tmp, [], {
      disabled: [{ target: "agents", filePath: "AGENTS.md" }],
    });
    expect(drifts).toEqual([]);
  });

  it("threads packagePath onto every drift entry", async () => {
    const result = makeResult("CLAUDE.md", wrapSection("stack", "# stack"));
    const drifts = await computeContentDrift(tmp, [result], {
      packagePath: "apps/web",
    });
    expect(drifts[0]!.packagePath).toBe("apps/web");
  });
});
