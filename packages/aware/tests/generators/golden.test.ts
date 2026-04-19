import { describe, it, expect } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { ClaudeGenerator } from "../../src/generators/claude.js";
import { composeContext } from "../../src/generators/composer.js";
import type { AwareConfig, DetectedStack, Fragment } from "../../src/types.js";

/**
 * Golden-file regression guard. Hash-matching tests verify self-consistency
 * but miss silent reordering or marker-ID rename regressions — any refactor
 * that changes section order or heading wording must be an intentional
 * snapshot update, not a quiet change that breaks every downstream hash in
 * the wild.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GOLDEN_DIR = path.join(__dirname, "../fixtures/golden");

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
    project: {
      name: "golden-project",
      description: "Fixture project used for golden-file tests.",
      architecture: "Next.js on Vercel",
    },
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
      deployment: "vercel",
      auth: null,
      apiStyle: null,
    },
    conventions: {
      naming: { files: "kebab-case", components: "PascalCase" },
    },
    rules: ["Use server components by default"],
    structure: { "src/app": "App router pages" },
    targets: { claude: true, cursor: false, copilot: false, agents: false },
    _meta: {
      createdAt: "2025-01-01T00:00:00.000Z",
      lastSyncedAt: null,
      lastDetectionHash: "fixture",
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
    deployment: makeStackItem("vercel"),
    auth: null,
    apiStyle: null,
    stateManagement: null,
    cicd: null,
    bundler: null,
  };
}

const fragment: Fragment = {
  id: "golden-fragment",
  category: "framework",
  title: "Golden Fragment",
  content:
    "## Golden Fragment\n- First bullet\n- Second bullet\n- Third bullet",
  priority: 10,
};

describe("Claude generator golden file", () => {
  const goldenPath = path.join(GOLDEN_DIR, "claude.golden.md");

  it("matches the committed golden file exactly", async () => {
    const ctx = composeContext(makeStack(), makeConfig(), [fragment]);
    const result = new ClaudeGenerator().generate(ctx);

    if (process.env.UPDATE_GOLDEN) {
      await fs.mkdir(GOLDEN_DIR, { recursive: true });
      await fs.writeFile(goldenPath, result.content);
    }

    const golden = await fs.readFile(goldenPath, "utf8");
    expect(result.content).toBe(golden);
  });
});
