import { describe, it, expect } from "vitest";
import { CursorGenerator, condenseFragment } from "../../src/generators/cursor.js";
import { composeContext } from "../../src/generators/composer.js";
import type { DetectedStack, AwareConfig, Fragment } from "../../src/types.js";

function makeStackItem(name: string, variant: string | null = null) {
  return {
    name,
    version: "1.0",
    variant,
    confidence: 0.95,
    detectedFrom: "test",
  };
}

function makeConfig(): AwareConfig {
  return {
    version: 1,
    project: { name: "test-project", description: "A test project", architecture: "" },
    stack: {
      framework: "nextjs@15.1:app-router",
      language: "typescript@5.5",
      styling: "tailwindcss@4.0",
      orm: null,
      database: null,
      testing: ["vitest@3.0"],
      linting: ["eslint@9.0"],
      packageManager: "pnpm",
      monorepo: null,
      deployment: null,
      auth: null,
      apiStyle: null,
    },
    conventions: {},
    rules: ["Use server components by default"],
    structure: {},
    targets: { claude: true, cursor: true, copilot: false, agents: false },
    _meta: {
      createdAt: new Date().toISOString(),
      lastSyncedAt: null,
      lastDetectionHash: "",
      awareVersion: "0.1.0",
    },
  };
}

function makeStack(): DetectedStack {
  return {
    framework: makeStackItem("nextjs", "app-router"),
    language: makeStackItem("typescript"),
    styling: makeStackItem("tailwindcss"),
    orm: null,
    database: null,
    testing: [makeStackItem("vitest")],
    linting: [makeStackItem("eslint")],
    packageManager: makeStackItem("pnpm"),
    monorepo: null,
    deployment: null,
    auth: null,
    apiStyle: null,
  };
}

describe("condenseFragment", () => {
  it("extracts imperative rule lines from fragment content", () => {
    const fragment: Fragment = {
      id: "test",
      category: "framework",
      title: "Test",
      content: [
        "## Test Framework",
        "- Use server components by default",
        "- Some non-imperative note",
        "- Always validate inputs",
        "- Never use any type",
        "- Prefer named exports",
      ].join("\n"),
      priority: 10,
    };

    const rules = condenseFragment(fragment);
    expect(rules.length).toBeGreaterThan(0);
    expect(rules.length).toBeLessThanOrEqual(4);

    // Should contain imperative lines
    const joined = rules.join(" ");
    expect(joined).toMatch(/Use|Always|Never|Prefer/i);
  });

  it("returns empty array for fragment with no imperative lines", () => {
    const fragment: Fragment = {
      id: "test",
      category: "framework",
      title: "Test",
      content: "## Title\nSome plain text content.\nAnother line.",
      priority: 10,
    };

    const rules = condenseFragment(fragment);
    expect(rules).toEqual([]);
  });
});

describe("CursorGenerator", () => {
  it("generates flat text output", () => {
    const config = makeConfig();
    const stack = makeStack();
    const fragments: Fragment[] = [
      {
        id: "nextjs-15",
        category: "framework",
        title: "Next.js 15",
        content: "## Next.js 15\n- Use App Router for all pages\n- Prefer server components",
        priority: 10,
      },
    ];

    const context = composeContext(stack, config, fragments);
    const generator = new CursorGenerator();
    const result = generator.generate(context);

    expect(result.target).toBe("cursor");
    expect(result.filePath).toBe(".cursorrules");

    // Should be flat text (no markdown headers)
    expect(result.content).not.toMatch(/^##\s/m);

    // Contains "Rules:"
    expect(result.content).toContain("Rules:");

    // Contains tech stack line
    expect(result.content).toMatch(/Tech stack:/);
  });
});
