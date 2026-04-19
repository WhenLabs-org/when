import { describe, it, expect } from "vitest";
import { definePlugin, defineFragment } from "../../src/plugins/api.js";
import type { FragmentModule } from "../../src/types.js";

describe("definePlugin / defineFragment", () => {
  it("definePlugin is an identity function", () => {
    const plugin = definePlugin({
      name: "test-plugin",
      version: "1.0.0",
    });
    expect(plugin.name).toBe("test-plugin");
    expect(plugin.version).toBe("1.0.0");
  });

  it("defineFragment is an identity function", () => {
    const module: FragmentModule = {
      id: "test-fragment",
      category: "framework",
      priority: 10,
      build: () => null,
    };
    expect(defineFragment(module)).toBe(module);
  });

  it("definePlugin accepts a full fragment list", () => {
    const plugin = definePlugin({
      name: "multi",
      fragments: [
        defineFragment({
          id: "a",
          category: "framework",
          priority: 10,
          build: () => null,
        }),
        defineFragment({
          id: "b",
          category: "styling",
          priority: 20,
          build: () => null,
        }),
      ],
    });
    expect(plugin.fragments).toHaveLength(2);
  });
});
