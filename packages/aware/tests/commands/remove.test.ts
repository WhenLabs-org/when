import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { removeCommand } from "../../src/commands/remove.js";
import {
  createDefaultConfig,
  loadConfig,
  saveConfig,
} from "../../src/utils/config.js";
import { setSilent } from "../../src/utils/logger.js";
import type { StackConfig, TargetsConfig } from "../../src/types.js";

const emptyStack: StackConfig = {
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
};
const targets: TargetsConfig = {
  claude: true,
  cursor: false,
  copilot: false,
  agents: false,
};

async function withCwd<T>(dir: string, fn: () => Promise<T>): Promise<T> {
  const original = process.cwd();
  process.chdir(dir);
  try {
    return await fn();
  } finally {
    process.chdir(original);
  }
}

describe("aware remove", () => {
  let tmp: string;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "aware-remove-"));
    const config = createDefaultConfig("test", emptyStack, targets);
    config.rules = ["first rule", "second rule", "third rule"];
    config.structure = { "src/app": "App code", "src/lib": "Utilities" };
    config.conventions = { naming: { files: "kebab-case", components: "PascalCase" } };
    config.plugins = ["aware-plugin-a", "aware-plugin-b"];
    await saveConfig(tmp, config);

    exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
    setSilent(true);
  });

  afterEach(() => {
    exitSpy.mockRestore();
    setSilent(false);
  });

  it("removes a rule by index", async () => {
    await withCwd(tmp, () =>
      removeCommand({ type: "rule", index: "1" }),
    );
    const config = await loadConfig(tmp);
    expect(config!.rules).toEqual(["first rule", "third rule"]);
  });

  it("rejects out-of-range rule index", async () => {
    await withCwd(tmp, () =>
      removeCommand({ type: "rule", index: "99" }),
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("removes a structure entry by path", async () => {
    await withCwd(tmp, () =>
      removeCommand({ type: "structure", id: "src/lib" }),
    );
    const config = await loadConfig(tmp);
    expect(config!.structure).toEqual({ "src/app": "App code" });
  });

  it("removes a convention by category.key", async () => {
    await withCwd(tmp, () =>
      removeCommand({ type: "convention", id: "naming.files" }),
    );
    const config = await loadConfig(tmp);
    expect((config!.conventions.naming as Record<string, string>).files).toBeUndefined();
    expect((config!.conventions.naming as Record<string, string>).components).toBe(
      "PascalCase",
    );
  });

  it("rejects convention id without a dot", async () => {
    await withCwd(tmp, () =>
      removeCommand({ type: "convention", id: "bad" }),
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("removes a plugin by specifier", async () => {
    await withCwd(tmp, () =>
      removeCommand({ type: "plugin", id: "aware-plugin-a" }),
    );
    const config = await loadConfig(tmp);
    expect(config!.plugins).toEqual(["aware-plugin-b"]);
  });

  it("removes the last plugin and collapses plugins to undefined", async () => {
    await withCwd(tmp, () =>
      removeCommand({ type: "plugin", id: "aware-plugin-a" }),
    );
    await withCwd(tmp, () =>
      removeCommand({ type: "plugin", id: "aware-plugin-b" }),
    );
    const config = await loadConfig(tmp);
    expect(config!.plugins).toBeUndefined();
  });

  it("errors for an unknown type", async () => {
    await withCwd(tmp, () =>
      removeCommand({ type: "nonsense" }),
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("removes a deeply-nested convention via dotted path (three segments)", async () => {
    // Seed a nested convention under conventions.naming.components.case.
    const config = (await loadConfig(tmp))!;
    const naming = (config.conventions.naming ?? {}) as Record<string, unknown>;
    naming.components = { case: "PascalCase", suffix: "" };
    config.conventions.naming = naming as typeof config.conventions.naming;
    await saveConfig(tmp, config);

    await withCwd(tmp, () =>
      removeCommand({ type: "convention", id: "naming.components.case" }),
    );

    const after = await loadConfig(tmp);
    const afterNaming = after!.conventions.naming as Record<string, unknown>;
    // Only `case` was removed; `suffix` survives.
    expect((afterNaming.components as Record<string, unknown>).case).toBeUndefined();
    expect((afterNaming.components as Record<string, unknown>).suffix).toBe("");
  });

  it("rejects a convention id that stops at a non-object on the path", async () => {
    await withCwd(tmp, () =>
      removeCommand({
        type: "convention",
        // naming.files is a string, so descending into `naming.files.x` must fail.
        id: "naming.files.x",
      }),
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("--index beats --id for plugin remove when both provided", async () => {
    // index=0 selects "aware-plugin-a"; --id names "aware-plugin-b".
    // Only "aware-plugin-a" should be removed.
    await withCwd(tmp, () =>
      removeCommand({ type: "plugin", index: "0", id: "aware-plugin-b" }),
    );
    const after = await loadConfig(tmp);
    expect(after!.plugins).toEqual(["aware-plugin-b"]);
  });
});
