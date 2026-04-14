import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { detectEnvUsage } from "../../src/env/detector.js";
import type { EnvSchema } from "../../src/schema/types.js";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const testDir = join(tmpdir(), "envalid-detector-test");

const schema: EnvSchema = {
  version: 1,
  variables: {
    DATABASE_URL: { type: "url", required: true },
    API_KEY: { type: "string", required: true },
    PORT: { type: "integer", required: true },
    UNUSED_VAR: { type: "string", required: false },
  },
};

beforeEach(() => {
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe("detectEnvUsage", () => {
  it("detects process.env.VAR_NAME in JS/TS files", () => {
    writeFileSync(
      join(testDir, "app.ts"),
      `
const db = process.env.DATABASE_URL;
const port = process.env.PORT;
const secret = process.env.SECRET_TOKEN;
`,
    );

    const result = detectEnvUsage(testDir, schema);
    expect(result.usedInCode).toContain("DATABASE_URL");
    expect(result.usedInCode).toContain("PORT");
    expect(result.usedInCode).toContain("SECRET_TOKEN");
    expect(result.usedNotInSchema).toContain("SECRET_TOKEN");
    expect(result.inSchemaNotUsed).toContain("UNUSED_VAR");
  });

  it("detects process.env[\"VAR\"] bracket notation", () => {
    writeFileSync(
      join(testDir, "config.ts"),
      `const key = process.env["API_KEY"];`,
    );

    const result = detectEnvUsage(testDir, schema);
    expect(result.usedInCode).toContain("API_KEY");
  });

  it("detects Python os.environ patterns", () => {
    writeFileSync(
      join(testDir, "app.py"),
      `
import os
db = os.environ["DATABASE_URL"]
key = os.environ.get("API_KEY")
port = os.getenv("PORT")
`,
    );

    const result = detectEnvUsage(testDir, schema);
    expect(result.usedInCode).toContain("DATABASE_URL");
    expect(result.usedInCode).toContain("API_KEY");
    expect(result.usedInCode).toContain("PORT");
  });

  it("detects import.meta.env for Vite", () => {
    writeFileSync(
      join(testDir, "vite-app.ts"),
      `const url = import.meta.env.DATABASE_URL;`,
    );

    const result = detectEnvUsage(testDir, schema);
    expect(result.usedInCode).toContain("DATABASE_URL");
  });

  it("reports vars in schema but not used", () => {
    writeFileSync(join(testDir, "empty.ts"), `// no env vars`);

    const result = detectEnvUsage(testDir, schema);
    expect(result.inSchemaNotUsed).toContain("DATABASE_URL");
    expect(result.inSchemaNotUsed).toContain("API_KEY");
    expect(result.inSchemaNotUsed).toContain("PORT");
    expect(result.inSchemaNotUsed).toContain("UNUSED_VAR");
  });

  it("returns synced when code and schema match", () => {
    writeFileSync(
      join(testDir, "app.ts"),
      `
process.env.DATABASE_URL;
process.env.API_KEY;
process.env.PORT;
process.env.UNUSED_VAR;
`,
    );

    const result = detectEnvUsage(testDir, schema);
    expect(result.inSchemaNotUsed).toHaveLength(0);
    expect(result.usedNotInSchema).toHaveLength(0);
  });

  it("skips excluded directories", () => {
    mkdirSync(join(testDir, "vendor"), { recursive: true });
    writeFileSync(
      join(testDir, "vendor", "lib.ts"),
      `process.env.VENDOR_VAR;`,
    );
    writeFileSync(
      join(testDir, "app.ts"),
      `process.env.DATABASE_URL;`,
    );

    const result = detectEnvUsage(testDir, schema, {
      exclude: ["vendor"],
    });
    expect(result.usedInCode).not.toContain("VENDOR_VAR");
    expect(result.usedInCode).toContain("DATABASE_URL");
  });
});
