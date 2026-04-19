import { describe, it, expect } from "vitest";
import { diffEnvFiles } from "../../src/commands/diff.js";
import type { EnvFile } from "../../src/env/reader.js";
import type { EnvSchema } from "../../src/schema/types.js";

function makeEnv(vars: Record<string, string>, path = ".env"): EnvFile {
  return { path, variables: vars };
}

describe("diffEnvFiles", () => {
  it("reports no diff for identical envs", () => {
    const result = diffEnvFiles(
      makeEnv({ A: "1", B: "2" }),
      makeEnv({ A: "1", B: "2" }, ".env.prod"),
    );
    expect(result.entries).toHaveLength(0);
  });

  it("reports added variables", () => {
    const result = diffEnvFiles(
      makeEnv({ A: "1" }),
      makeEnv({ A: "1", B: "2" }, ".env.prod"),
    );
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].status).toBe("added");
    expect(result.entries[0].variable).toBe("B");
  });

  it("reports removed variables", () => {
    const result = diffEnvFiles(
      makeEnv({ A: "1", B: "2" }),
      makeEnv({ A: "1" }, ".env.prod"),
    );
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].status).toBe("removed");
  });

  it("reports changed variables", () => {
    const result = diffEnvFiles(
      makeEnv({ A: "1" }),
      makeEnv({ A: "2" }, ".env.prod"),
    );
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].status).toBe("changed");
    expect(result.entries[0].sourceValue).toBe("1");
    expect(result.entries[0].targetValue).toBe("2");
  });

  it("masks sensitive values when schema provided", () => {
    const schema: EnvSchema = {
      version: 1,
      variables: {
        SECRET: { type: "string", required: true, sensitive: true },
      },
    };
    const result = diffEnvFiles(
      makeEnv({ SECRET: "super_secret_value" }),
      makeEnv({ SECRET: "other_secret_value" }, ".env.prod"),
      schema,
    );
    expect(result.entries[0].sourceValue).not.toBe("super_secret_value");
    expect(result.entries[0].sourceValue).toContain("*");
  });
});
