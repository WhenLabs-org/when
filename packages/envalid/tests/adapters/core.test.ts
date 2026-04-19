import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEnv } from "../../src/adapters/core.js";
import { createClientEnv } from "../../src/adapters/nextjs.js";

describe("adapters/core createEnv", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "envalid-adapter-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns a frozen typed object when schema is valid", () => {
    const schemaPath = join(dir, ".env.schema");
    writeFileSync(
      schemaPath,
      [
        "version: 1",
        "variables:",
        "  PORT:",
        "    type: integer",
        "    required: true",
        "  DEBUG:",
        "    type: boolean",
        "    required: false",
        "    default: false",
        "  TAGS:",
        "    type: csv",
        "    required: false",
        "",
      ].join("\n"),
    );
    const env = createEnv({
      schemaPath,
      source: { PORT: "3000", DEBUG: "true", TAGS: "a,b,c" },
    });
    expect(env.PORT).toBe(3000);
    expect(env.DEBUG).toBe(true);
    expect(env.TAGS).toEqual(["a", "b", "c"]);
    expect(Object.isFrozen(env)).toBe(true);
  });

  it("throws when a required var is missing", () => {
    const schemaPath = join(dir, ".env.schema");
    writeFileSync(
      schemaPath,
      "version: 1\nvariables:\n  REQ:\n    type: string\n    required: true\n",
    );
    expect(() => createEnv({ schemaPath, source: {} })).toThrow(
      /Environment validation failed/,
    );
  });
});

describe("adapters/nextjs", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "envalid-next-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("only exposes public vars to the client", () => {
    const schemaPath = join(dir, ".env.schema");
    writeFileSync(
      schemaPath,
      [
        "version: 1",
        "variables:",
        "  NEXT_PUBLIC_API:",
        "    type: url",
        "    required: true",
        "  SERVER_SECRET:",
        "    type: string",
        "    required: true",
        "",
      ].join("\n"),
    );
    const clientEnv = createClientEnv({
      schemaPath,
      source: {
        NEXT_PUBLIC_API: "https://api.example.com",
        SERVER_SECRET: "topsecret",
      },
    });
    expect(clientEnv.NEXT_PUBLIC_API).toBe("https://api.example.com");
    expect(clientEnv.SERVER_SECRET).toBeUndefined();
  });
});
