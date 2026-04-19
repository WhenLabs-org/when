import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadSchema, mergeSchemas } from "../../src/schema/loader.js";
import type { EnvSchema } from "../../src/schema/types.js";

describe("loadSchema", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "envalid-schema-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("loads a single file", () => {
    writeFileSync(
      join(dir, "schema.yaml"),
      `version: 1\nvariables:\n  FOO:\n    type: string\n    required: true\n`,
    );
    const s = loadSchema(join(dir, "schema.yaml"));
    expect(s.variables.FOO.type).toBe("string");
  });

  it("merges extends — child wins on conflict, parent contributes extras", () => {
    writeFileSync(
      join(dir, "base.yaml"),
      `version: 1\nvariables:\n  SHARED:\n    type: string\n    required: true\n    description: base\n  BASE_ONLY:\n    type: integer\n    required: false\n`,
    );
    writeFileSync(
      join(dir, "child.yaml"),
      `version: 1\nextends: ./base.yaml\nvariables:\n  SHARED:\n    type: string\n    required: false\n    description: child\n  CHILD_ONLY:\n    type: boolean\n    required: true\n`,
    );
    const s = loadSchema(join(dir, "child.yaml"));
    expect(s.variables.SHARED.required).toBe(false);
    expect(s.variables.SHARED.description).toBe("child");
    expect(s.variables.BASE_ONLY).toBeDefined();
    expect(s.variables.CHILD_ONLY).toBeDefined();
    expect("extends" in s).toBe(false);
  });

  it("applies imports last-wins", () => {
    writeFileSync(
      join(dir, "main.yaml"),
      `version: 1\nimports: [./overlay.yaml]\nvariables:\n  FOO:\n    type: string\n    required: true\n`,
    );
    writeFileSync(
      join(dir, "overlay.yaml"),
      `version: 1\nvariables:\n  FOO:\n    type: url\n    required: true\n  OVERLAY:\n    type: integer\n    required: true\n`,
    );
    const s = loadSchema(join(dir, "main.yaml"));
    expect(s.variables.FOO.type).toBe("url");
    expect(s.variables.OVERLAY).toBeDefined();
  });

  it("detects cycles", () => {
    writeFileSync(
      join(dir, "a.yaml"),
      `version: 1\nextends: ./b.yaml\nvariables:\n  A:\n    type: string\n    required: false\n`,
    );
    writeFileSync(
      join(dir, "b.yaml"),
      `version: 1\nextends: ./a.yaml\nvariables:\n  B:\n    type: string\n    required: false\n`,
    );
    expect(() => loadSchema(join(dir, "a.yaml"))).toThrowError(/Cyclic/);
  });
});

describe("mergeSchemas", () => {
  it("merges groups", () => {
    const a: EnvSchema = {
      version: 1,
      variables: {},
      groups: {
        g: { variables: ["X"], required_in: ["dev"] },
      },
    };
    const b: EnvSchema = {
      version: 1,
      variables: {},
      groups: {
        g: { variables: ["Y"], required_in: ["prod"] },
      },
    };
    const merged = mergeSchemas(a, b);
    expect(merged.groups?.g.variables.sort()).toEqual(["X", "Y"]);
    expect(merged.groups?.g.required_in?.sort()).toEqual(["dev", "prod"]);
  });
});
