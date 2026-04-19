import { describe, it, expect } from "vitest";
import {
  Registry,
  definePlugin,
  getDefaultRegistry,
  resetDefaultRegistry,
} from "../../src/runtime/registry.js";
import {
  BUILTIN_TYPES,
  registerBuiltins,
} from "../../src/runtime/builtins.js";
import { parseSchemaString } from "../../src/schema/parser.js";

describe("Registry", () => {
  it("registers and retrieves validators", () => {
    const reg = new Registry();
    reg.registerValidator({
      name: "aws-region",
      typeHint: "string",
      validate: (v) =>
        /^[a-z]{2}-[a-z]+-\d+$/.test(v)
          ? { valid: true }
          : { valid: false, message: "bad region" },
    });
    expect(reg.validatorNames()).toContain("aws-region");
    expect(reg.getValidator("aws-region")?.typeHint).toBe("string");
  });

  it("registers a plugin's validators and providers", () => {
    const reg = new Registry();
    const plugin = definePlugin({
      name: "test",
      validators: [
        {
          name: "x",
          validate: () => ({ valid: true }),
        },
      ],
      providers: [
        {
          scheme: "test-vault",
          resolve: async () => "value",
        },
      ],
    });
    reg.registerPlugin(plugin);
    expect(reg.getValidator("x")).toBeDefined();
    expect(reg.getProvider("test-vault")).toBeDefined();
  });
});

describe("parseSchemaString with plugin types", () => {
  it("rejects an unknown type with a did-you-mean hint", () => {
    expect(() =>
      parseSchemaString(
        `version: 1\nvariables:\n  X:\n    type: strng\n    required: true\n`,
      ),
    ).toThrowError(/unknown type "strng"/);
  });

  it("accepts a plugin-contributed type when passed via extraTypes", () => {
    const schema = parseSchemaString(
      `version: 1\nvariables:\n  REGION:\n    type: aws-region\n    required: true\n`,
      { extraTypes: ["aws-region"] },
    );
    expect(schema.variables.REGION.type).toBe("aws-region");
  });

  it("still parses all builtin types", () => {
    for (const t of BUILTIN_TYPES) {
      const extra: Record<string, unknown> = {};
      if (t === "enum") extra.values = ["a", "b"];
      const yaml =
        `version: 1\nvariables:\n  X:\n    type: ${t}\n    required: true\n` +
        (t === "enum" ? "    values: [a, b]\n" : "");
      const schema = parseSchemaString(yaml);
      expect(schema.variables.X.type).toBe(t);
    }
  });
});

describe("default registry", () => {
  it("can be reset for isolated tests", () => {
    resetDefaultRegistry();
    const reg = getDefaultRegistry();
    registerBuiltins(reg);
    expect(reg.getValidator("integer")).toBeDefined();
  });
});
