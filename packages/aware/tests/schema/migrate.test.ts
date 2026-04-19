import { describe, it, expect } from "vitest";
import { migrate } from "../../src/schema/migrate.js";
import { SCHEMA_VERSION } from "../../src/constants.js";

const v1Sample = {
  version: 1,
  project: { name: "old", description: "", architecture: "" },
  stack: {
    framework: "nextjs@15.1:app-router",
    language: "typescript@5.5",
    styling: null,
    orm: null,
    database: null,
    testing: [],
    linting: [],
    packageManager: "pnpm",
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
    createdAt: "2025-01-01T00:00:00.000Z",
    lastSyncedAt: null,
    lastDetectionHash: "abc",
    awareVersion: "0.1.0",
  },
};

describe("migrate v1 -> v2", () => {
  it("bumps the version and preserves all existing fields", () => {
    const { config, migrated, fromVersion } = migrate(v1Sample);
    expect(migrated).toBe(true);
    expect(fromVersion).toBe(1);
    expect(config.version).toBe(SCHEMA_VERSION);
    expect(config.project.name).toBe("old");
    expect(config.stack.framework).toBe("nextjs@15.1:app-router");
    expect(config._meta.createdAt).toBe("2025-01-01T00:00:00.000Z");
    expect(config._meta.lastDetectionHash).toBe("abc");
  });

  it("initializes the new fileHashes and fragmentVersions fields", () => {
    const { config } = migrate(v1Sample);
    expect(config._meta.fileHashes).toEqual({});
    expect(config._meta.fragmentVersions).toEqual({});
  });

  it("is a no-op for already-current v2 config", () => {
    const { config: v2 } = migrate(v1Sample);
    const { migrated, fromVersion, config: again } = migrate(v2);
    expect(migrated).toBe(false);
    expect(fromVersion).toBe(SCHEMA_VERSION);
    expect(again.version).toBe(SCHEMA_VERSION);
  });

  it("throws on a future schema version", () => {
    expect(() => migrate({ ...v1Sample, version: 999 })).toThrow(/newer/);
  });

  it("throws on non-object input", () => {
    expect(() => migrate("not an object")).toThrow(/object/);
  });

  it("throws on array input", () => {
    expect(() => migrate([1, 2, 3])).toThrow(/object/);
  });

  it("throws on an object that is neither v1-shaped nor has a version", () => {
    expect(() => migrate({ random: "junk" })).toThrow(/not recognizable/);
  });

  it("accepts a versionless object if it has the v1 shape", () => {
    const versionless = { ...v1Sample } as Record<string, unknown>;
    delete versionless.version;
    const { config, migrated, fromVersion } = migrate(versionless);
    expect(fromVersion).toBe(1);
    expect(migrated).toBe(true);
    expect(config.version).toBe(SCHEMA_VERSION);
  });

  it("does not alias _meta back into the caller's object", () => {
    const input = JSON.parse(JSON.stringify(v1Sample));
    const { config } = migrate(input);
    config._meta.fileHashes = { "": { claude: "abc" } };
    expect((input._meta as Record<string, unknown>).fileHashes).toBeUndefined();
  });
});
