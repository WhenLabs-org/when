import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { scan } from "../../src/scan.js";
import { saveConfig } from "../../src/utils/config.js";
import { resetLoadedPlugins } from "../../src/plugins/loader.js";
import { setSilent } from "../../src/utils/logger.js";
import type { TargetsConfig } from "../../src/types.js";

const targets: TargetsConfig = {
  claude: true,
  cursor: false,
  copilot: false,
  agents: false,
};

/**
 * `init --force` on a pre-seeded `.aware.json` with `plugins: [...]`
 * must preserve the plugins field in the resulting config. Without
 * this, users who hand-wrote their plugin list pre-init would silently
 * lose it on re-init.
 */
describe("scan() carries existing plugins field forward", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "aware-carry-"));
    resetLoadedPlugins();
    setSilent(true);
  });

  afterEach(() => {
    setSilent(false);
  });

  it("preserves plugins: [...] from existing config", async () => {
    await fs.writeFile(
      path.join(tmp, "package.json"),
      JSON.stringify({ name: "carry" }),
    );
    // Pre-seed `.aware.json` with a plugins array that points at a
    // real fixture. We don't need the plugin itself to do anything —
    // we're testing that the field survives scan().
    await saveConfig(tmp, {
      version: 2,
      project: { name: "carry", description: "", architecture: "" },
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
      conventions: { extract: false },
      rules: [],
      structure: {},
      targets,
      _meta: {
        createdAt: "2025-01-01T00:00:00.000Z",
        lastSyncedAt: null,
        lastDetectionHash: "",
        awareVersion: "0.1.0",
      },
      plugins: ["./nonexistent-plugin.js"],
    });

    const result = await scan({ projectRoot: tmp, detect: false });
    expect(result.config.plugins).toEqual(["./nonexistent-plugin.js"]);
  });

  it("preserves packages: [...] from existing monorepo root config", async () => {
    await fs.writeFile(
      path.join(tmp, "package.json"),
      JSON.stringify({ name: "mono-carry" }),
    );
    await saveConfig(tmp, {
      version: 2,
      project: { name: "mono-carry", description: "", architecture: "" },
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
      conventions: { extract: false },
      rules: [],
      structure: {},
      targets,
      _meta: {
        createdAt: "2025-01-01T00:00:00.000Z",
        lastSyncedAt: null,
        lastDetectionHash: "",
        awareVersion: "0.1.0",
      },
      packages: ["apps/*", "libs/*"],
    });

    const result = await scan({ projectRoot: tmp, detect: false });
    expect(result.config.packages).toEqual(["apps/*", "libs/*"]);
  });

  it("leaves plugins undefined when existing config has no plugins field", async () => {
    await fs.writeFile(
      path.join(tmp, "package.json"),
      JSON.stringify({ name: "no-plugins" }),
    );
    const result = await scan({ projectRoot: tmp, detect: false });
    expect(result.config.plugins).toBeUndefined();
  });
});
