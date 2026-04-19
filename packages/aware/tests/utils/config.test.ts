import { describe, it, expect, beforeEach } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { createDefaultConfig, loadConfig, saveConfig } from "../../src/utils/config.js";
import type { StackConfig, TargetsConfig } from "../../src/types.js";

const defaultStack: StackConfig = {
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
};

const defaultTargets: TargetsConfig = {
  claude: true,
  cursor: true,
  copilot: false,
  agents: false,
};

describe("createDefaultConfig", () => {
  it("returns a valid AwareConfig", () => {
    const config = createDefaultConfig("test-project", defaultStack, defaultTargets);

    expect(config.version).toBe(2);
    expect(config.project.name).toBe("test-project");
    expect(config.stack).toEqual(defaultStack);
    expect(config.targets).toEqual(defaultTargets);
    expect(config.conventions).toEqual({});
    expect(config.rules).toEqual([]);
    expect(config.structure).toEqual({});
    expect(config._meta.createdAt).toBeTruthy();
    expect(config._meta.lastDetectionHash).toBeTruthy();
    expect(config._meta.awareVersion).toBeTruthy();
    expect(config._meta.fileHashes).toEqual({});
    expect(config._meta.fragmentVersions).toEqual({});
  });
});

describe("loadConfig / saveConfig round-trip", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "aware-test-"));
  });

  it("saves and loads config correctly", async () => {
    const config = createDefaultConfig("round-trip-test", defaultStack, defaultTargets);

    await saveConfig(tmpDir, config);
    const loaded = await loadConfig(tmpDir);

    expect(loaded).not.toBeNull();
    expect(loaded!.project.name).toBe("round-trip-test");
    expect(loaded!.stack).toEqual(defaultStack);
    expect(loaded!.targets).toEqual(defaultTargets);
    expect(loaded!._meta.lastDetectionHash).toBe(config._meta.lastDetectionHash);
  });

  it("returns null when no config file exists", async () => {
    const loaded = await loadConfig(tmpDir);
    expect(loaded).toBeNull();
  });
});
