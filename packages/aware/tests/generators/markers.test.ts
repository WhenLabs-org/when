import { describe, it, expect } from "vitest";
import { ClaudeGenerator } from "../../src/generators/claude.js";
import { CursorGenerator } from "../../src/generators/cursor.js";
import { CopilotGenerator } from "../../src/generators/copilot.js";
import { AgentsGenerator } from "../../src/generators/agents.js";
import { composeContext } from "../../src/generators/composer.js";
import { parseSections } from "../../src/core/markers.js";
import { verifyStampedHash } from "../../src/core/hash.js";
import type { AwareConfig, DetectedStack, Fragment } from "../../src/types.js";

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
    version: 2,
    project: { name: "t", description: "A test project", architecture: "" },
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
    structure: { "src/app": "App router pages" },
    targets: { claude: true, cursor: true, copilot: true, agents: true },
    _meta: {
      createdAt: new Date().toISOString(),
      lastSyncedAt: null,
      lastDetectionHash: "",
      awareVersion: "0.1.0",
      fileHashes: {},
      fragmentVersions: {},
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
    stateManagement: null,
    cicd: null,
    bundler: null,
  };
}

const fragment: Fragment = {
  id: "nextjs-15",
  category: "framework",
  title: "Next.js 15",
  content: "## Next.js 15\n- Use App Router\n- Prefer server components",
  priority: 10,
};

describe("generators emit section markers and a stamped hash", () => {
  for (const [name, GenClass] of [
    ["claude", ClaudeGenerator],
    ["cursor", CursorGenerator],
    ["copilot", CopilotGenerator],
    ["agents", AgentsGenerator],
  ] as const) {
    it(`${name}: output contains parseable section markers`, () => {
      const ctx = composeContext(makeStack(), makeConfig(), [fragment]);
      const result = new GenClass().generate(ctx);
      const sections = parseSections(result.content);
      expect(sections.length).toBeGreaterThan(0);
      expect(sections.every((s) => s.id.length > 0)).toBe(true);
    });

    it(`${name}: output carries a valid stamped hash`, () => {
      const ctx = composeContext(makeStack(), makeConfig(), [fragment]);
      const result = new GenClass().generate(ctx);
      const verification = verifyStampedHash(result.content);
      expect(verification.embedded).toMatch(/^[a-f0-9]{16}$/);
      expect(verification.matches).toBe(true);
    });

    it(`${name}: regenerating identical input produces identical content`, () => {
      const ctx = composeContext(makeStack(), makeConfig(), [fragment]);
      const a = new GenClass().generate(ctx);
      const b = new GenClass().generate(ctx);
      expect(a.content).toBe(b.content);
    });
  }
});
