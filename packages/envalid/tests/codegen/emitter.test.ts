import { describe, it, expect } from "vitest";
import { generateTypedClient } from "../../src/codegen/emitter.js";
import type { EnvSchema } from "../../src/schema/types.js";

const schema: EnvSchema = {
  version: 1,
  variables: {
    PORT: { type: "integer", required: true, range: [1, 65535] },
    LOG_LEVEL: {
      type: "enum",
      required: true,
      values: ["debug", "info", "warn", "error"],
    },
    DATABASE_URL: { type: "url", required: true },
    ALLOWED_ORIGINS: { type: "csv", required: false },
    DEBUG: { type: "boolean", required: false, default: false },
    CONFIG_JSON: { type: "json", required: false },
  },
};

describe("generateTypedClient", () => {
  it("emits a frozen env object + shape interface", () => {
    const out = generateTypedClient(schema, { schemaPath: ".env.schema" });
    expect(out).toContain("export const env = Object.freeze({");
    expect(out).toContain("} as const);");
    expect(out).toContain("export interface EnvShape");
    expect(out).toContain("export type Env = typeof env;");
  });

  it("maps built-in types to TypeScript types", () => {
    const out = generateTypedClient(schema);
    expect(out).toMatch(/PORT: number;/);
    expect(out).toMatch(
      /LOG_LEVEL: "debug" \| "info" \| "warn" \| "error";/,
    );
    expect(out).toMatch(/DATABASE_URL: string;/);
    expect(out).toMatch(/ALLOWED_ORIGINS\?: readonly string\[\];/);
    // DEBUG has a default so it's non-optional in the shape.
    expect(out).toMatch(/DEBUG: boolean;/);
    expect(out).toMatch(/CONFIG_JSON\?: unknown;/);
  });

  it("emits literal defaults with ?? fallback", () => {
    const out = generateTypedClient(schema);
    expect(out).toMatch(
      /DEBUG: \['true', '1'\]\.includes\(String\(\(process\.env\.DEBUG \?\? "false"\)\)\.toLowerCase\(\)\) as boolean/,
    );
  });

  it("supports import.meta.env runtime", () => {
    const out = generateTypedClient(schema, { runtime: "import-meta" });
    expect(out).toContain("import.meta.env.PORT");
    expect(out).not.toContain("process.env.PORT");
  });

  it("sorts variables alphabetically for deterministic output", () => {
    const out = generateTypedClient(schema);
    const order = [
      "ALLOWED_ORIGINS",
      "CONFIG_JSON",
      "DATABASE_URL",
      "DEBUG",
      "LOG_LEVEL",
      "PORT",
    ];
    let lastIdx = -1;
    for (const name of order) {
      const idx = out.indexOf(`  ${name}: `);
      expect(idx, `${name} should appear`).toBeGreaterThan(lastIdx);
      lastIdx = idx;
    }
  });
});
