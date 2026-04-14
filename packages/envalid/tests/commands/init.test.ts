import { describe, it, expect } from "vitest";
import { inferType, generateSchema } from "../../src/commands/init.js";

describe("inferType", () => {
  it("infers boolean", () => {
    expect(inferType("DEBUG", "true").type).toBe("boolean");
    expect(inferType("FLAG", "false").type).toBe("boolean");
    expect(inferType("TOGGLE", "1").type).toBe("boolean");
    expect(inferType("OFF", "0").type).toBe("boolean");
  });

  it("infers integer", () => {
    expect(inferType("PORT", "3000").type).toBe("integer");
    expect(inferType("COUNT", "-5").type).toBe("integer");
  });

  it("infers float", () => {
    expect(inferType("RATE", "0.95").type).toBe("float");
    expect(inferType("THRESHOLD", "-1.5").type).toBe("float");
  });

  it("infers URL", () => {
    expect(inferType("DB", "postgres://localhost/db").type).toBe("url");
    expect(inferType("SITE", "https://example.com").type).toBe("url");
  });

  it("infers email", () => {
    expect(inferType("ADMIN", "admin@example.com").type).toBe("email");
  });

  it("infers semver", () => {
    expect(inferType("VERSION", "1.2.3").type).toBe("semver");
    expect(inferType("VER", "0.0.1-beta").type).toBe("semver");
  });

  it("infers JSON", () => {
    expect(inferType("CONFIG", '{"key":"value"}').type).toBe("json");
    expect(inferType("LIST", "[1,2,3]").type).toBe("json");
  });

  it("infers CSV", () => {
    expect(inferType("ORIGINS", "origin1,origin2,origin3").type).toBe("csv");
  });

  it("infers string as fallback", () => {
    expect(inferType("NAME", "hello").type).toBe("string");
  });

  it("marks sensitive keys", () => {
    expect(inferType("API_KEY", "abc123").sensitive).toBe(true);
    expect(inferType("SECRET_TOKEN", "xyz").sensitive).toBe(true);
    expect(inferType("DB_PASSWORD", "pass").sensitive).toBe(true);
    expect(inferType("NAME", "hello").sensitive).toBeUndefined();
  });
});

describe("generateSchema", () => {
  it("generates schema from env variables", () => {
    const schema = generateSchema({
      variables: {
        PORT: "3000",
        DEBUG: "true",
        API_KEY: "secret123",
      },
    });
    expect(schema.version).toBe(1);
    expect(schema.variables.PORT.type).toBe("integer");
    expect(schema.variables.DEBUG.type).toBe("boolean");
    expect(schema.variables.API_KEY.sensitive).toBe(true);
  });
});
