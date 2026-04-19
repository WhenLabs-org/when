import { describe, it, expect } from "vitest";
import { resolveFragments } from "../../src/fragments/index.js";
import type { AwareConfig, DetectedStack, StackItem } from "../../src/types.js";

/**
 * Phase 7 backfill coverage: each newly-added fragment fires for its
 * own detected stack item. The shared assertion shape catches two
 * classes of bug in one test: the fragment wasn't wired into
 * `allFragmentFunctions`, or its `matchesStack` predicate disagrees
 * with what the detector emits.
 */

function item(name: string): StackItem {
  return {
    name,
    version: null,
    variant: null,
    confidence: 0.95,
    detectedFrom: "test",
  };
}

function makeStack(overrides: Partial<DetectedStack>): DetectedStack {
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
    stateManagement: null,
    cicd: null,
    bundler: null,
    ...overrides,
  };
}

function makeConfig(): AwareConfig {
  return {
    version: 2,
    project: { name: "t", description: "", architecture: "" },
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
    targets: { claude: true, cursor: false, copilot: false, agents: false },
    _meta: {
      createdAt: "now",
      lastSyncedAt: null,
      lastDetectionHash: "",
      awareVersion: "0.1.0",
    },
  };
}

describe("Phase 7 backfill fragments fire on their detected stack", () => {
  const cases: Array<{
    name: string;
    stackKey: keyof DetectedStack;
    fragmentId: string;
    titleContains: string;
  }> = [
    { name: "pinia", stackKey: "stateManagement", fragmentId: "pinia", titleContains: "Pinia" },
    { name: "mobx", stackKey: "stateManagement", fragmentId: "mobx", titleContains: "MobX" },
    { name: "valtio", stackKey: "stateManagement", fragmentId: "valtio", titleContains: "Valtio" },
    { name: "recoil", stackKey: "stateManagement", fragmentId: "recoil", titleContains: "Recoil" },
    { name: "sequelize", stackKey: "orm", fragmentId: "sequelize", titleContains: "Sequelize" },
    { name: "passport", stackKey: "auth", fragmentId: "passport", titleContains: "Passport" },
    { name: "circleci", stackKey: "cicd", fragmentId: "circleci", titleContains: "CircleCI" },
    { name: "jenkins", stackKey: "cicd", fragmentId: "jenkins", titleContains: "Jenkins" },
  ];

  for (const c of cases) {
    it(`${c.name}: fragment fires when ${c.stackKey} === ${c.name}`, () => {
      const stack = makeStack({ [c.stackKey]: item(c.name) } as Partial<DetectedStack>);
      const fragments = resolveFragments(stack, makeConfig());
      const match = fragments.find((f) => f.id === c.fragmentId);
      expect(match, `expected fragment id "${c.fragmentId}" to fire`).toBeDefined();
      expect(match!.title).toContain(c.titleContains);
      expect(match!.content.length).toBeGreaterThan(200);
    });

    it(`${c.name}: fragment does NOT fire on an unrelated stack`, () => {
      const stack = makeStack({});
      const fragments = resolveFragments(stack, makeConfig());
      expect(fragments.find((f) => f.id === c.fragmentId)).toBeUndefined();
    });
  }
});
