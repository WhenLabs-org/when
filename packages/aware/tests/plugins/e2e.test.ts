import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { scan } from "../../src/scan.js";
import {
  loadPlugins,
  resetLoadedPlugins,
} from "../../src/plugins/loader.js";
import { saveConfig } from "../../src/utils/config.js";
import { setSilent } from "../../src/utils/logger.js";
import type { TargetsConfig } from "../../src/types.js";

const fixturesDir = path.resolve(__dirname, "..", "fixtures");

const targets: TargetsConfig = {
  claude: true,
  cursor: false,
  copilot: false,
  agents: false,
};

describe("plugin end-to-end via scan()", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "aware-plugin-e2e-"));
    resetLoadedPlugins();
    setSilent(true);
  });

  afterEach(() => {
    setSilent(false);
  });

  it("scan picks up plugin-contributed fragments when .aware.json lists the plugin", async () => {
    // Point the plugin specifier at the sample fixture via an absolute
    // path so resolution doesn't depend on tmp's node_modules.
    const absPluginPath = path.join(fixturesDir, "plugin-sample/index.js");
    await fs.writeFile(
      path.join(tmp, "package.json"),
      JSON.stringify({ name: "plugin-e2e" }),
    );
    const configPath = path.join(tmp, ".aware.json");
    await saveConfig(tmp, {
      version: 2,
      project: { name: "plugin-e2e", description: "", architecture: "" },
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
        createdAt: new Date().toISOString(),
        lastSyncedAt: null,
        lastDetectionHash: "",
        awareVersion: "0.1.0",
      },
      plugins: [absPluginPath],
    });
    // Sanity: config saved. Compare against the parsed value, not the raw
    // file contents — JSON escapes Windows backslashes (C:\foo → "C:\\foo")
    // and a toContain(absPluginPath) would miss on windows-latest runners.
    const saved = JSON.parse(await fs.readFile(configPath, "utf8"));
    expect(saved.plugins).toContain(absPluginPath);

    const result = await scan({ projectRoot: tmp, detect: true });
    const pluginFragment = result.fragments.find(
      (f) => f.id === "sample-plugin-fragment",
    );
    expect(pluginFragment).toBeDefined();
    expect(pluginFragment!.content).toContain("came from a plugin");
  });

  it("plugin with `replaces` overrides a core fragment", async () => {
    // Seed a Next.js 15 project so the core `nextjs-15` module would
    // otherwise apply. The override plugin declares `replaces:
    // ["nextjs-15"]` AND matches the same appliesTo gate, so the core
    // output is suppressed and the plugin's version wins.
    await fs.writeFile(
      path.join(tmp, "package.json"),
      JSON.stringify({
        name: "override-e2e",
        dependencies: { next: "^15.1.0", react: "^19.0.0" },
      }),
    );
    await fs.writeFile(
      path.join(tmp, "pnpm-lock.yaml"),
      `lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      next:
        specifier: ^15.1.0
        version: 15.1.2
      react:
        specifier: ^19.0.0
        version: 19.0.0
`,
    );
    await fs.mkdir(path.join(tmp, "app"));
    await fs.writeFile(path.join(tmp, "app/page.tsx"), "");

    const absPluginPath = path.join(fixturesDir, "plugin-override/index.js");
    // Load the plugin before scan runs — scan() will read the config
    // but we can prime the registry directly via loadPlugins() too.
    await loadPlugins({
      projectRoot: tmp,
      pluginSpecifiers: [absPluginPath],
    });

    const result = await scan({ projectRoot: tmp, detect: true });
    const fw = result.fragments.find((f) => f.id === "nextjs-app-router");
    expect(fw).toBeDefined();
    // Plugin's content won, not core's.
    expect(fw!.content).toContain("Plugin Override");
    expect(fw!.content).not.toContain("cached by default");
  });
});
