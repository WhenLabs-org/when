import { describe, it, expect } from "vitest";
import { computeStackDrift } from "../../src/diff/stack-diff.js";
import type { StackConfig } from "../../src/types.js";

function stack(overrides: Partial<StackConfig> = {}): StackConfig {
  return {
    framework: null,
    language: null,
    styling: null,
    orm: null,
    database: null,
    testing: [],
    linting: [],
    packageManager: null,
    monorepo: null,
    deployment: null,
    auth: null,
    apiStyle: null,
    ...overrides,
  } as StackConfig;
}

describe("computeStackDrift", () => {
  it("returns [] when stacks are identical", () => {
    const prev = stack({ framework: "nextjs@15", language: "typescript" });
    const curr = stack({ framework: "nextjs@15", language: "typescript" });
    expect(computeStackDrift(prev, curr)).toEqual([]);
  });

  it("flags additions", () => {
    const prev = stack();
    const curr = stack({ framework: "nextjs@15" });
    const drifts = computeStackDrift(prev, curr);
    expect(drifts).toHaveLength(1);
    expect(drifts[0]!.kind).toBe("added");
    expect(drifts[0]!.current).toBe("nextjs@15");
    expect(drifts[0]!.previous).toBeNull();
  });

  it("flags removals", () => {
    const prev = stack({ framework: "nextjs@15" });
    const curr = stack();
    const drifts = computeStackDrift(prev, curr);
    expect(drifts[0]!.kind).toBe("removed");
    expect(drifts[0]!.previous).toBe("nextjs@15");
    expect(drifts[0]!.current).toBeNull();
  });

  it("flags changes", () => {
    const prev = stack({ framework: "nextjs@14" });
    const curr = stack({ framework: "nextjs@15" });
    const drifts = computeStackDrift(prev, curr);
    expect(drifts[0]!.kind).toBe("changed");
    expect(drifts[0]!.previous).toBe("nextjs@14");
    expect(drifts[0]!.current).toBe("nextjs@15");
  });

  it("joins array values into a stable string for comparison", () => {
    const prev = stack({ testing: ["vitest", "playwright"] });
    const curr = stack({ testing: ["vitest", "playwright"] });
    expect(computeStackDrift(prev, curr)).toEqual([]);
  });

  it("treats empty array as null", () => {
    const prev = stack({ testing: [] });
    const curr = stack();
    expect(computeStackDrift(prev, curr)).toEqual([]);
  });

  it("applies human-readable labels", () => {
    const prev = stack();
    const curr = stack({ packageManager: "pnpm" });
    expect(computeStackDrift(prev, curr)[0]!.label).toBe("Package Manager");
  });
});
