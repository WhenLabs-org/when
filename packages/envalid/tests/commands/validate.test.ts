import { describe, it, expect } from "vitest";
import { validate } from "../../src/commands/validate.js";
import type { EnvSchema } from "../../src/schema/types.js";
import type { EnvFile } from "../../src/env/reader.js";

function makeEnv(vars: Record<string, string>): EnvFile {
  return { path: ".env", variables: vars };
}

const schema: EnvSchema = {
  version: 1,
  variables: {
    NODE_ENV: {
      type: "enum",
      required: true,
      values: ["development", "production"],
    },
    PORT: {
      type: "integer",
      required: true,
      range: [1024, 65535],
    },
    DB_URL: {
      type: "url",
      required: true,
      sensitive: true,
    },
    API_KEY: {
      type: "string",
      required: true,
      sensitive: true,
      environments: ["production"],
    },
    DEBUG: {
      type: "boolean",
      required: false,
    },
  },
  groups: {
    secrets: {
      variables: ["API_KEY"],
      required_in: ["production"],
    },
  },
};

describe("validate", () => {
  it("passes when all required vars are present and valid", () => {
    const result = validate(
      schema,
      makeEnv({
        NODE_ENV: "development",
        PORT: "3000",
        DB_URL: "postgres://localhost/db",
      }),
    );
    expect(result.valid).toBe(true);
    expect(result.stats.errors).toBe(0);
  });

  it("reports missing required variable", () => {
    const result = validate(
      schema,
      makeEnv({
        NODE_ENV: "development",
        DB_URL: "postgres://localhost/db",
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.issues.find((i) => i.variable === "PORT")?.severity).toBe("error");
  });

  it("reports wrong type", () => {
    const result = validate(
      schema,
      makeEnv({
        NODE_ENV: "development",
        PORT: "abc",
        DB_URL: "postgres://localhost/db",
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.issues.find((i) => i.variable === "PORT")).toBeDefined();
  });

  it("reports unknown variables as warnings", () => {
    const result = validate(
      schema,
      makeEnv({
        NODE_ENV: "development",
        PORT: "3000",
        DB_URL: "postgres://localhost/db",
        UNKNOWN_VAR: "foo",
      }),
    );
    expect(result.valid).toBe(true);
    expect(result.stats.warnings).toBe(1);
    expect(result.issues.find((i) => i.variable === "UNKNOWN_VAR")?.severity).toBe("warning");
  });

  it("reports unknown variables as errors in CI mode", () => {
    const result = validate(
      schema,
      makeEnv({
        NODE_ENV: "development",
        PORT: "3000",
        DB_URL: "postgres://localhost/db",
        UNKNOWN_VAR: "foo",
      }),
      { ci: true },
    );
    expect(result.valid).toBe(false);
    expect(result.issues.find((i) => i.variable === "UNKNOWN_VAR")?.severity).toBe("error");
  });

  it("respects environment-scoped requirements", () => {
    // API_KEY is only required in production
    const resultDev = validate(
      schema,
      makeEnv({
        NODE_ENV: "development",
        PORT: "3000",
        DB_URL: "postgres://localhost/db",
      }),
    );
    expect(resultDev.valid).toBe(true);

    const resultProd = validate(
      schema,
      makeEnv({
        NODE_ENV: "production",
        PORT: "3000",
        DB_URL: "postgres://localhost/db",
      }),
      { environment: "production" },
    );
    expect(resultProd.valid).toBe(false);
    expect(resultProd.issues.find((i) => i.variable === "API_KEY")).toBeDefined();
  });

  it("redacts sensitive values in error output", () => {
    const result = validate(
      schema,
      makeEnv({
        NODE_ENV: "development",
        PORT: "3000",
        DB_URL: "not-a-url",
      }),
    );
    const dbIssue = result.issues.find((i) => i.variable === "DB_URL");
    expect(dbIssue?.actual).toBe("[REDACTED]");
  });

  it("checks group constraints", () => {
    const result = validate(
      schema,
      makeEnv({
        NODE_ENV: "production",
        PORT: "3000",
        DB_URL: "postgres://localhost/db",
      }),
      { environment: "production" },
    );
    expect(result.valid).toBe(false);
    // API_KEY should be required both by its environments field and the group
    const apiKeyIssues = result.issues.filter((i) => i.variable === "API_KEY");
    expect(apiKeyIssues.length).toBeGreaterThanOrEqual(1);
  });
});
