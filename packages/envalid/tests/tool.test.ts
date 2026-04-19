import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTool } from "../src/tool.js";

const SCHEMA_YAML = `version: 1
variables:
  NODE_ENV:
    type: enum
    values: [development, production]
    required: true
  PORT:
    type: integer
    required: true
    range: [1024, 65535]
`;

describe("createTool", () => {
  let workdir: string;

  beforeEach(() => {
    workdir = mkdtempSync(join(tmpdir(), "envalid-tool-"));
  });

  afterEach(() => {
    rmSync(workdir, { recursive: true, force: true });
  });

  it("returns a Tool with name, description, and scan()", () => {
    const tool = createTool();
    expect(tool.name).toBe("envalid");
    expect(typeof tool.description).toBe("string");
    expect(typeof tool.scan).toBe("function");
  });

  it("scan() returns a ScanResult matching the core contract", async () => {
    writeFileSync(join(workdir, ".env.schema"), SCHEMA_YAML);
    writeFileSync(
      join(workdir, ".env"),
      "NODE_ENV=development\nPORT=3000\n",
    );

    const result = await createTool().scan({ cwd: workdir });

    expect(result.schemaVersion).toBe(1);
    expect(result.tool).toBe("envalid");
    expect(result.ok).toBe(true);
    expect(result.project.cwd).toBe(workdir);
    expect(Array.isArray(result.findings)).toBe(true);
    expect(result.summary).toMatchObject({
      total: expect.any(Number),
      errors: 0,
      warnings: expect.any(Number),
      infos: expect.any(Number),
    });
    expect(typeof result.timing.startedAt).toBe("string");
    expect(typeof result.timing.durationMs).toBe("number");
  });

  it("scan() emits Finding[] entries for invalid env vars", async () => {
    writeFileSync(join(workdir, ".env.schema"), SCHEMA_YAML);
    writeFileSync(
      join(workdir, ".env"),
      "NODE_ENV=development\nPORT=not-a-number\n",
    );

    const result = await createTool().scan({ cwd: workdir });

    expect(result.ok).toBe(false);
    expect(result.summary.errors).toBeGreaterThan(0);
    const portFinding = result.findings.find(
      (f) => (f.data as { variable?: string })?.variable === "PORT",
    );
    expect(portFinding).toBeDefined();
    expect(portFinding!.tool).toBe("envalid");
    expect(portFinding!.ruleId).toBe("invalid-value");
    expect(portFinding!.severity).toBe("error");
    expect(typeof portFinding!.message).toBe("string");
  });

  it("scan() reports missing schema as an error finding", async () => {
    const result = await createTool().scan({ cwd: workdir });
    expect(result.ok).toBe(false);
    const missing = result.findings.find((f) => f.ruleId === "schema-not-found");
    expect(missing).toBeDefined();
    expect(missing!.severity).toBe("error");
  });
});
