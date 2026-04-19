import { describe, it, expect } from "vitest";
import {
  toJsonSchema,
  toOpenApiComponent,
} from "../../src/export/jsonSchema.js";
import type { EnvSchema } from "../../src/schema/types.js";

const schema: EnvSchema = {
  version: 1,
  variables: {
    PORT: { type: "integer", required: true, range: [1, 65535] },
    LOG_LEVEL: {
      type: "enum",
      required: true,
      values: ["debug", "info"],
    },
    DATABASE_URL: {
      type: "url",
      required: true,
      sensitive: true,
      description: "Postgres connection string",
    },
    DEBUG: { type: "boolean", required: false, default: "false" },
  },
};

describe("toJsonSchema", () => {
  it("emits a Draft-2020-12 document", () => {
    const out = toJsonSchema(schema);
    expect(out.$schema).toBe(
      "https://json-schema.org/draft/2020-12/schema",
    );
    expect(out.type).toBe("object");
    const properties = out.properties as Record<string, Record<string, unknown>>;
    expect(properties.PORT.type).toBe("integer");
    expect(properties.PORT.minimum).toBe(1);
    expect(properties.PORT.maximum).toBe(65535);
    expect(properties.LOG_LEVEL.enum).toEqual(["debug", "info"]);
    expect(properties.DATABASE_URL.format).toBe("uri");
    expect(properties.DATABASE_URL["x-envalid-sensitive"]).toBe(true);
    expect(properties.DATABASE_URL.description).toBe(
      "Postgres connection string",
    );
    expect(properties.DEBUG.default).toBe("false");
  });

  it("only marks required variables without defaults as required", () => {
    const out = toJsonSchema(schema);
    expect(out.required).toEqual(["DATABASE_URL", "LOG_LEVEL", "PORT"]);
  });
});

describe("toOpenApiComponent", () => {
  it("emits components.schemas.Env with no $schema key at inner root", () => {
    const doc = toOpenApiComponent(schema);
    expect(doc.openapi).toBe("3.1.0");
    const schemas = (doc.components as Record<string, unknown>).schemas as Record<
      string,
      Record<string, unknown>
    >;
    expect(schemas.Env.type).toBe("object");
    expect(schemas.Env.$schema).toBeUndefined();
  });
});
