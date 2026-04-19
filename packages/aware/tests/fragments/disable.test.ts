import { describe, it, expect } from "vitest";
import { FragmentRegistry } from "../../src/fragments/registry.js";
import type {
  AwareConfig,
  DetectedStack,
  Fragment,
  FragmentModule,
} from "../../src/types.js";

function stub(id: string, priority = 10): FragmentModule {
  return {
    id,
    category: "framework",
    priority,
    build: (): Fragment => ({
      id,
      category: "framework",
      title: id,
      content: `body of ${id}`,
      priority,
    }),
  };
}

function emptyStack(): DetectedStack {
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
  };
}

function configWithDisabled(disabled: string[] = []): AwareConfig {
  return {
    version: 2,
    project: { name: "t", description: "", architecture: "" },
    stack: emptyStack() as unknown as AwareConfig["stack"],
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
    fragments: { disabled },
  };
}

describe("FragmentRegistry honors config.fragments.disabled", () => {
  it("suppresses fragments whose id is in the disabled list", () => {
    const reg = new FragmentRegistry();
    reg.register(stub("alpha"));
    reg.register(stub("beta"));
    reg.register(stub("gamma"));

    const fragments = reg.resolve(
      emptyStack(),
      configWithDisabled(["beta"]),
    );
    expect(fragments.map((f) => f.id)).toEqual(["alpha", "gamma"]);
  });

  it("empty disabled list is equivalent to no disabled field", () => {
    const reg = new FragmentRegistry();
    reg.register(stub("alpha"));
    reg.register(stub("beta"));

    const all = reg.resolve(emptyStack(), configWithDisabled([]));
    expect(all.map((f) => f.id)).toEqual(["alpha", "beta"]);
  });

  it("disabling a non-existent id is a silent no-op", () => {
    const reg = new FragmentRegistry();
    reg.register(stub("alpha"));
    const fragments = reg.resolve(
      emptyStack(),
      configWithDisabled(["missing-id"]),
    );
    expect(fragments.map((f) => f.id)).toEqual(["alpha"]);
  });

  it("disable works for plugin fragments too (same id namespace as core)", () => {
    // Plugin fragments register through the same path; disabling one
    // by id is indistinguishable from disabling a core one.
    const reg = new FragmentRegistry();
    reg.register(stub("core-frag"));
    reg.register({
      id: "plugin-override",
      category: "framework",
      priority: 5,
      build: (): Fragment => ({
        id: "plugin-frag",
        category: "framework",
        title: "from plugin",
        content: "x",
        priority: 5,
      }),
    });
    const fragments = reg.resolve(
      emptyStack(),
      configWithDisabled(["plugin-frag"]),
    );
    expect(fragments.map((f) => f.id)).toEqual(["core-frag"]);
  });
});
