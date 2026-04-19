import { describe, it, expect } from "vitest";
import { validateValue } from "../../src/schema/validators.js";
import type { VariableSchema } from "../../src/schema/types.js";

function makeSchema(overrides: Partial<VariableSchema>): VariableSchema {
  return { type: "string", required: true, ...overrides } as VariableSchema;
}

describe("string validator", () => {
  it("accepts any non-empty string", () => {
    const result = validateValue("hello", makeSchema({ type: "string" }));
    expect(result.valid).toBe(true);
  });

  it("validates pattern", () => {
    const schema = makeSchema({ type: "string", pattern: "^sk_test_" });
    expect(validateValue("sk_test_abc", schema).valid).toBe(true);
    expect(validateValue("pk_test_abc", schema).valid).toBe(false);
  });

  it("validates minLength", () => {
    const schema = makeSchema({ type: "string", minLength: 5 });
    expect(validateValue("abcde", schema).valid).toBe(true);
    expect(validateValue("abc", schema).valid).toBe(false);
  });

  it("validates maxLength", () => {
    const schema = makeSchema({ type: "string", maxLength: 3 });
    expect(validateValue("ab", schema).valid).toBe(true);
    expect(validateValue("abcde", schema).valid).toBe(false);
  });
});

describe("integer validator", () => {
  it("accepts valid integers", () => {
    expect(validateValue("42", makeSchema({ type: "integer" })).valid).toBe(true);
    expect(validateValue("-5", makeSchema({ type: "integer" })).valid).toBe(true);
    expect(validateValue("0", makeSchema({ type: "integer" })).valid).toBe(true);
  });

  it("rejects non-integers", () => {
    expect(validateValue("3.14", makeSchema({ type: "integer" })).valid).toBe(false);
    expect(validateValue("abc", makeSchema({ type: "integer" })).valid).toBe(false);
    expect(validateValue("", makeSchema({ type: "integer" })).valid).toBe(false);
  });

  it("validates range", () => {
    const schema = makeSchema({ type: "integer", range: [1, 100] });
    expect(validateValue("50", schema).valid).toBe(true);
    expect(validateValue("1", schema).valid).toBe(true);
    expect(validateValue("100", schema).valid).toBe(true);
    expect(validateValue("0", schema).valid).toBe(false);
    expect(validateValue("101", schema).valid).toBe(false);
  });
});

describe("float validator", () => {
  it("accepts valid floats", () => {
    expect(validateValue("3.14", makeSchema({ type: "float" })).valid).toBe(true);
    expect(validateValue("0.5", makeSchema({ type: "float" })).valid).toBe(true);
    expect(validateValue("42", makeSchema({ type: "float" })).valid).toBe(true);
  });

  it("rejects non-numeric", () => {
    expect(validateValue("abc", makeSchema({ type: "float" })).valid).toBe(false);
    expect(validateValue("", makeSchema({ type: "float" })).valid).toBe(false);
  });

  it("validates range", () => {
    const schema = makeSchema({ type: "float", range: [0, 1] });
    expect(validateValue("0.5", schema).valid).toBe(true);
    expect(validateValue("1.5", schema).valid).toBe(false);
  });
});

describe("boolean validator", () => {
  it("accepts valid booleans", () => {
    expect(validateValue("true", makeSchema({ type: "boolean" })).valid).toBe(true);
    expect(validateValue("false", makeSchema({ type: "boolean" })).valid).toBe(true);
    expect(validateValue("1", makeSchema({ type: "boolean" })).valid).toBe(true);
    expect(validateValue("0", makeSchema({ type: "boolean" })).valid).toBe(true);
    expect(validateValue("TRUE", makeSchema({ type: "boolean" })).valid).toBe(true);
  });

  it("rejects invalid booleans", () => {
    expect(validateValue("yes", makeSchema({ type: "boolean" })).valid).toBe(false);
    expect(validateValue("no", makeSchema({ type: "boolean" })).valid).toBe(false);
    expect(validateValue("abc", makeSchema({ type: "boolean" })).valid).toBe(false);
  });
});

describe("url validator", () => {
  it("accepts valid URLs", () => {
    expect(validateValue("https://example.com", makeSchema({ type: "url" })).valid).toBe(true);
    expect(validateValue("postgres://user:pass@localhost:5432/db", makeSchema({ type: "url" })).valid).toBe(true);
  });

  it("rejects invalid URLs", () => {
    expect(validateValue("not-a-url", makeSchema({ type: "url" })).valid).toBe(false);
  });

  it("validates protocol", () => {
    const schema = makeSchema({ type: "url", protocol: ["postgres", "postgresql"] });
    expect(validateValue("postgres://localhost/db", schema).valid).toBe(true);
    expect(validateValue("mysql://localhost/db", schema).valid).toBe(false);
  });
});

describe("email validator", () => {
  it("accepts valid emails", () => {
    expect(validateValue("user@example.com", makeSchema({ type: "email" })).valid).toBe(true);
  });

  it("rejects invalid emails", () => {
    expect(validateValue("not-an-email", makeSchema({ type: "email" })).valid).toBe(false);
    expect(validateValue("@example.com", makeSchema({ type: "email" })).valid).toBe(false);
  });
});

describe("enum validator", () => {
  const schema = makeSchema({ type: "enum", values: ["dev", "staging", "prod"] });

  it("accepts valid enum values", () => {
    expect(validateValue("dev", schema).valid).toBe(true);
    expect(validateValue("prod", schema).valid).toBe(true);
  });

  it("rejects invalid enum values", () => {
    expect(validateValue("invalid", schema).valid).toBe(false);
  });
});

describe("csv validator", () => {
  it("accepts non-empty CSV", () => {
    expect(validateValue("a,b,c", makeSchema({ type: "csv" })).valid).toBe(true);
    expect(validateValue("single", makeSchema({ type: "csv" })).valid).toBe(true);
  });

  it("rejects empty CSV", () => {
    expect(validateValue("", makeSchema({ type: "csv" })).valid).toBe(false);
    expect(validateValue("  ", makeSchema({ type: "csv" })).valid).toBe(false);
  });
});

describe("json validator", () => {
  it("accepts valid JSON", () => {
    expect(validateValue('{"key":"value"}', makeSchema({ type: "json" })).valid).toBe(true);
    expect(validateValue("[1,2,3]", makeSchema({ type: "json" })).valid).toBe(true);
    expect(validateValue('"string"', makeSchema({ type: "json" })).valid).toBe(true);
  });

  it("rejects invalid JSON", () => {
    expect(validateValue("{invalid}", makeSchema({ type: "json" })).valid).toBe(false);
  });
});

describe("path validator", () => {
  it("accepts non-empty paths", () => {
    expect(validateValue("./data/uploads", makeSchema({ type: "path" })).valid).toBe(true);
    expect(validateValue("/usr/local/bin", makeSchema({ type: "path" })).valid).toBe(true);
  });

  it("rejects empty paths", () => {
    expect(validateValue("", makeSchema({ type: "path" })).valid).toBe(false);
    expect(validateValue("   ", makeSchema({ type: "path" })).valid).toBe(false);
  });
});

describe("semver validator", () => {
  it("accepts valid semver", () => {
    expect(validateValue("1.2.3", makeSchema({ type: "semver" })).valid).toBe(true);
    expect(validateValue("0.0.1", makeSchema({ type: "semver" })).valid).toBe(true);
    expect(validateValue("1.0.0-beta.1", makeSchema({ type: "semver" })).valid).toBe(true);
    expect(validateValue("1.0.0+build.123", makeSchema({ type: "semver" })).valid).toBe(true);
  });

  it("rejects invalid semver", () => {
    expect(validateValue("1.2", makeSchema({ type: "semver" })).valid).toBe(false);
    expect(validateValue("v1.2.3", makeSchema({ type: "semver" })).valid).toBe(false);
    expect(validateValue("abc", makeSchema({ type: "semver" })).valid).toBe(false);
  });
});
