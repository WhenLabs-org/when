import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { loadPlugins, resetLoadedPlugins } from "../../src/plugins/loader.js";
import { setSilent } from "../../src/utils/logger.js";

/**
 * Two plugins that produce the same fragment id without declaring
 * `replaces` should surface as a fragment-registration failure on the
 * second plugin — not silently overwrite, not crash the process.
 */
describe("plugin-vs-plugin id collision", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "aware-plug-coll-"));
    resetLoadedPlugins();
    setSilent(true);
  });

  afterEach(() => {
    setSilent(false);
  });

  it("second plugin with the same fragment id is flagged but doesn't crash the batch", async () => {
    await fs.writeFile(
      path.join(tmp, "plugin-a.mjs"),
      `
export default {
  name: "plugin-a",
  fragments: [
    {
      id: "duplicate-id-${Date.now()}",
      category: "framework",
      priority: 10,
      build: () => ({
        id: "duplicate-id-${Date.now()}",
        category: "framework",
        title: "A",
        content: "from A",
        priority: 10,
      }),
    },
  ],
};
`,
    );
    // plugin-b declares an identically-named fragment WITHOUT replaces.
    // Having `duplicate-id` inlined ensures stable cross-plugin collision.
    const COLLISION_ID = `shared-id-${Math.random().toString(36).slice(2)}`;
    const pluginA = `
export default {
  name: "plugin-a",
  fragments: [
    {
      id: "${COLLISION_ID}",
      category: "framework",
      priority: 10,
      build: () => ({
        id: "${COLLISION_ID}",
        category: "framework",
        title: "A",
        content: "from A",
        priority: 10,
      }),
    },
  ],
};
`;
    const pluginB = `
export default {
  name: "plugin-b",
  fragments: [
    {
      id: "${COLLISION_ID}",
      category: "framework",
      priority: 10,
      build: () => ({
        id: "${COLLISION_ID}",
        category: "framework",
        title: "B",
        content: "from B",
        priority: 10,
      }),
    },
  ],
};
`;
    await fs.writeFile(path.join(tmp, "plugin-a.mjs"), pluginA);
    await fs.writeFile(path.join(tmp, "plugin-b.mjs"), pluginB);

    const result = await loadPlugins({
      projectRoot: tmp,
      pluginSpecifiers: ["./plugin-a.mjs", "./plugin-b.mjs"],
    });

    // Both plugins made it through import (so both appear in `loaded`).
    expect(result.loaded.map((l) => l.plugin.name)).toEqual([
      "plugin-a",
      "plugin-b",
    ]);
    // The second plugin's fragment registration failed (dup id);
    // surfaces as a `fragment-registration-failed` entry.
    const regFailures = result.failed.filter(
      (f) => f.code === "fragment-registration-failed",
    );
    expect(regFailures.length).toBeGreaterThanOrEqual(1);
    expect(regFailures[0]!.specifier).toBe("./plugin-b.mjs");
  });
});
