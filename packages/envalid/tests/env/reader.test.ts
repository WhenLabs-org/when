import { describe, it, expect } from "vitest";
import { readEnvFile, parseEnvString } from "../../src/env/reader.js";
import { EnvFileNotFoundError } from "../../src/errors.js";
import { resolve } from "node:path";

const FIXTURES = resolve(import.meta.dirname, "../fixtures");

describe("readEnvFile", () => {
  it("reads a valid env file", () => {
    const result = readEnvFile(resolve(FIXTURES, "sample.env"));
    expect(result.variables.NODE_ENV).toBe("development");
    expect(result.variables.PORT).toBe("3000");
    expect(result.variables.DATABASE_URL).toBe(
      "postgres://dev:dev@localhost:5432/myapp",
    );
  });

  it("throws for missing file", () => {
    expect(() => readEnvFile("/nonexistent")).toThrow(EnvFileNotFoundError);
  });
});

describe("parseEnvString", () => {
  it("parses key=value pairs", () => {
    const result = parseEnvString("FOO=bar\nBAZ=qux");
    expect(result.variables.FOO).toBe("bar");
    expect(result.variables.BAZ).toBe("qux");
  });

  it("handles comments and blank lines", () => {
    const result = parseEnvString("# comment\nFOO=bar\n\nBAZ=qux");
    expect(Object.keys(result.variables)).toEqual(["FOO", "BAZ"]);
  });

  it("handles quoted values", () => {
    const result = parseEnvString('FOO="hello world"');
    expect(result.variables.FOO).toBe("hello world");
  });
});
