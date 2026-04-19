import { describe, it, expect } from "vitest";
import { createTool } from "../src/tool.js";

const fixtures = new URL("./fixtures", import.meta.url).pathname;

describe("createTool", () => {
  it("returns a Tool with name and description", () => {
    const tool = createTool();
    expect(tool.name).toBe("aware");
    expect(tool.description).toMatch(/detect|sync|context/i);
    expect(typeof tool.scan).toBe("function");
  });

  it("scan() against empty fixture produces missing-ai-context-file findings", async () => {
    const tool = createTool();
    const result = await tool.scan({ cwd: `${fixtures}/empty` });

    expect(result.schemaVersion).toBe(1);
    expect(result.tool).toBe("aware");
    expect(result.project.cwd).toBe(`${fixtures}/empty`);

    // empty fixture has no CLAUDE.md/AGENTS.md/etc — every generated file
    // should be reported as missing.
    const missing = result.findings.filter((f) => f.ruleId === "missing-ai-context-file");
    expect(missing.length).toBeGreaterThan(0);
    for (const f of missing) {
      expect(f.tool).toBe("aware");
      expect(f.severity).toBe("warning");
      expect(f.location?.file).toBeTruthy();
    }

    expect(result.summary.total).toBe(result.findings.length);
    expect(result.summary.warnings).toBe(missing.length);
    expect(result.ok).toBe(true); // no errors

    // raw payload is stashed with the full detection snapshot
    expect(result.raw).toBeDefined();
    const raw = result.raw as { stack: unknown; generatedFiles: unknown[] };
    expect(raw.stack).toBeDefined();
    expect(Array.isArray(raw.generatedFiles)).toBe(true);
  });

  it("scan() against nextjs-app fixture reports stale files where content differs", async () => {
    const tool = createTool();
    const result = await tool.scan({ cwd: `${fixtures}/nextjs-app` });

    expect(result.schemaVersion).toBe(1);
    expect(result.tool).toBe("aware");

    // detectedStack hints should include nextjs + typescript
    expect(result.project.detectedStack).toContain("nextjs");
    expect(result.project.detectedStack).toContain("typescript");

    // The fixture ships outdated target files — these should surface as
    // stale-ai-context-file findings for whichever files already exist.
    const stale = result.findings.filter((f) => f.ruleId === "stale-ai-context-file");
    const staleFiles = stale.map((f) => f.location?.file);
    expect(staleFiles).toContain("CLAUDE.md");
    expect(staleFiles).toContain("AGENTS.md");

    // Every finding is either missing-* or stale-*, both warnings.
    for (const f of result.findings) {
      expect(["missing-ai-context-file", "stale-ai-context-file"]).toContain(f.ruleId);
      expect(f.severity).toBe("warning");
    }
  });
});
