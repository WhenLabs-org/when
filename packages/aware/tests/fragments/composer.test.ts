import { describe, it, expect } from "vitest";
import { resolveFragments } from "../../src/fragments/index.js";
import type { DetectedStack, AwareConfig } from "../../src/types.js";

// Phase 2 made framework and styling fragments version-aware, so test
// fixtures now need to supply versions — otherwise no version-specific
// fragment will match. Sensible defaults per known stack item:
const DEFAULT_VERSIONS: Record<string, string> = {
  nextjs: "15.1.0",
  tailwindcss: "4.0.0",
};

function makeStackItem(
  name: string,
  variant: string | null = null,
  version?: string,
) {
  return {
    name,
    version: version ?? DEFAULT_VERSIONS[name] ?? null,
    variant,
    confidence: 0.95,
    detectedFrom: "test",
  };
}

function makeConfig(overrides: Partial<AwareConfig> = {}): AwareConfig {
  return {
    version: 1,
    project: { name: "test", description: "", architecture: "" },
    stack: {
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
    },
    conventions: {},
    rules: [],
    structure: {},
    targets: { claude: true, cursor: true, copilot: false, agents: false },
    _meta: {
      createdAt: new Date().toISOString(),
      lastSyncedAt: null,
      lastDetectionHash: "",
      awareVersion: "0.1.0",
    },
    ...overrides,
  };
}

describe("resolveFragments", () => {
  it("returns fragments for a full nextjs stack in priority order", () => {
    const stack: DetectedStack = {
      framework: makeStackItem("nextjs", "app-router"),
      language: makeStackItem("typescript"),
      styling: makeStackItem("tailwindcss"),
      orm: makeStackItem("drizzle"),
      database: makeStackItem("postgres"),
      testing: [makeStackItem("vitest"), makeStackItem("playwright")],
      linting: [makeStackItem("eslint"), makeStackItem("prettier")],
      packageManager: makeStackItem("pnpm"),
      monorepo: null,
      deployment: makeStackItem("vercel"),
      auth: makeStackItem("nextauth"),
      apiStyle: makeStackItem("trpc"),
    };

    const config = makeConfig();
    const fragments = resolveFragments(stack, config);

    expect(fragments.length).toBeGreaterThan(0);

    // Verify sorted by priority (ascending)
    for (let i = 1; i < fragments.length; i++) {
      expect(fragments[i]!.priority).toBeGreaterThanOrEqual(fragments[i - 1]!.priority);
    }

    // Should include framework, styling, orm, testing, linting, deployment, auth, api fragments
    const categories = fragments.map((f) => f.category);
    expect(categories).toContain("framework");
    expect(categories).toContain("styling");
    expect(categories).toContain("orm");
    expect(categories).toContain("testing");
    expect(categories).toContain("deployment");
    expect(categories).toContain("auth");
    expect(categories).toContain("api");
  });

  it("returns fewer fragments for a minimal stack", () => {
    const stack: DetectedStack = {
      framework: null,
      language: makeStackItem("javascript"),
      styling: null,
      orm: null,
      database: null,
      testing: [],
      linting: [],
      packageManager: makeStackItem("npm"),
      monorepo: null,
      deployment: null,
      auth: null,
      apiStyle: null,
    };

    const config = makeConfig();
    const fragments = resolveFragments(stack, config);

    // Minimal stack should produce zero or very few fragments
    expect(fragments.length).toBeLessThan(3);
  });
});
