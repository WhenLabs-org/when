import { describe, it, expect } from "vitest";
import { mergeOptions } from "../../src/config.js";

describe("mergeOptions", () => {
  it("CLI options take precedence over config", () => {
    const config = { schema: "custom.schema", format: "json" as const, ci: true };
    const cliOptions = { schema: ".env.schema", format: "terminal" as const, ci: false };

    const merged = mergeOptions(config, cliOptions);
    expect(merged.schema).toBe(".env.schema");
    expect(merged.format).toBe("terminal");
    expect(merged.ci).toBe(false);
  });

  it("fills in missing CLI options from config", () => {
    const config = { schema: "custom.schema", format: "json" as const };
    const cliOptions = { schema: undefined as string | undefined, format: undefined as string | undefined };

    const merged = mergeOptions(config, cliOptions);
    expect(merged.schema).toBe("custom.schema");
    expect(merged.format).toBe("json");
  });

  it("returns CLI options when no config", () => {
    const config = {};
    const cliOptions = { schema: ".env.schema", ci: false };

    const merged = mergeOptions(config, cliOptions);
    expect(merged.schema).toBe(".env.schema");
    expect(merged.ci).toBe(false);
  });
});
