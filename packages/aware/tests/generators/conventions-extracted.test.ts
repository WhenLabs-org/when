import { describe, it, expect } from "vitest";
import { composeContext } from "../../src/generators/composer.js";
import type { AwareConfig, DetectedStack } from "../../src/types.js";

function makeStack(): DetectedStack {
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

function makeConfig(
  conventions: AwareConfig["conventions"],
): AwareConfig {
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
    conventions,
    rules: [],
    structure: {},
    targets: { claude: true, cursor: false, copilot: true, agents: true },
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

describe("buildConventionsSection (via composeContext)", () => {
  it("does not render the internal 'extracted' convention block", () => {
    const config = makeConfig({
      naming: { files: "kebab-case" },
      extracted: {
        _sampleSize: 200,
        _confidence: { naming: 1, tests: 1, layout: 0 },
        naming: { files: "kebab-case" },
        tests: { layout: "colocated" },
      },
    } as AwareConfig["conventions"]);

    const ctx = composeContext(makeStack(), config, []);
    expect(ctx.conventionsSection).not.toContain("Extracted");
    expect(ctx.conventionsSection).not.toContain("[object Object]");
    expect(ctx.conventionsSection).not.toContain("_sampleSize");
    expect(ctx.conventionsSection).toContain("### Naming");
  });

  it("skips any top-level convention key that starts with underscore", () => {
    const config = makeConfig({
      _private: { anything: "goes" },
      naming: { files: "kebab-case" },
    } as AwareConfig["conventions"]);

    const ctx = composeContext(makeStack(), config, []);
    expect(ctx.conventionsSection).not.toContain("_private");
    expect(ctx.conventionsSection).toContain("### Naming");
  });
});
