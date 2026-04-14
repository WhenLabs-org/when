import { describe, it, expect } from "vitest";
import { parseSchemaString, parseSchemaFile } from "../../src/schema/parser.js";
import { SchemaNotFoundError, SchemaParseError } from "../../src/errors.js";
import { resolve } from "node:path";

const FIXTURES = resolve(import.meta.dirname, "../fixtures");

describe("parseSchemaString", () => {
  it("parses a valid schema", () => {
    const schema = parseSchemaString(`
version: 1
variables:
  NODE_ENV:
    type: enum
    values: [development, production]
    required: true
    default: development
  PORT:
    type: integer
    required: true
    range: [1024, 65535]
`);
    expect(schema.version).toBe(1);
    expect(schema.variables.NODE_ENV.type).toBe("enum");
    expect(schema.variables.NODE_ENV.values).toEqual(["development", "production"]);
    expect(schema.variables.PORT.range).toEqual([1024, 65535]);
  });

  it("applies defaults for optional fields", () => {
    const schema = parseSchemaString(`
version: 1
variables:
  MY_VAR:
    type: string
`);
    expect(schema.variables.MY_VAR.required).toBe(true); // default
  });

  it("rejects enum without values", () => {
    expect(() =>
      parseSchemaString(`
version: 1
variables:
  BAD:
    type: enum
    required: true
`),
    ).toThrow(SchemaParseError);
  });

  it("rejects invalid type", () => {
    expect(() =>
      parseSchemaString(`
version: 1
variables:
  BAD:
    type: foobar
`),
    ).toThrow(SchemaParseError);
  });

  it("rejects range where min > max", () => {
    expect(() =>
      parseSchemaString(`
version: 1
variables:
  BAD:
    type: integer
    range: [100, 1]
`),
    ).toThrow(SchemaParseError);
  });

  it("parses groups", () => {
    const schema = parseSchemaString(`
version: 1
variables:
  DB_URL:
    type: url
  REDIS_URL:
    type: url
groups:
  data:
    variables: [DB_URL, REDIS_URL]
    required_in: [production]
`);
    expect(schema.groups?.data.variables).toEqual(["DB_URL", "REDIS_URL"]);
    expect(schema.groups?.data.required_in).toEqual(["production"]);
  });

  it("rejects invalid YAML", () => {
    expect(() => parseSchemaString("{{{{invalid yaml")).toThrow(SchemaParseError);
  });
});

describe("parseSchemaFile", () => {
  it("parses a valid schema file", () => {
    const schema = parseSchemaFile(resolve(FIXTURES, "valid.env.schema"));
    expect(schema.version).toBe(1);
    expect(Object.keys(schema.variables).length).toBe(9);
  });

  it("throws SchemaNotFoundError for missing file", () => {
    expect(() => parseSchemaFile("/nonexistent/path")).toThrow(SchemaNotFoundError);
  });

  it("throws SchemaParseError for invalid schema file", () => {
    expect(() => parseSchemaFile(resolve(FIXTURES, "invalid.env.schema"))).toThrow(SchemaParseError);
  });
});
