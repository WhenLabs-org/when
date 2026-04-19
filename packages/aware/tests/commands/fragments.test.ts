import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  fragmentsDisableCommand,
  fragmentsEnableCommand,
} from "../../src/commands/fragments.js";
import {
  createDefaultConfig,
  loadConfig,
  saveConfig,
} from "../../src/utils/config.js";
import { setSilent } from "../../src/utils/logger.js";
import type { StackConfig, TargetsConfig } from "../../src/types.js";

const stack: StackConfig = {
  framework: "nextjs@15.1:app-router",
  language: "typescript",
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

describe("aware fragments disable/enable", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "aware-fragments-"));
    const config = createDefaultConfig("frag-test", stack, targets);
    await saveConfig(tmp, config);
    setSilent(true);
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    setSilent(false);
    vi.restoreAllMocks();
  });

  it("disable adds the id to config.fragments.disabled", async () => {
    await withCwd(tmp, () => fragmentsDisableCommand("nextjs-app-router"));
    const config = await loadConfig(tmp);
    expect(config!.fragments?.disabled).toEqual(["nextjs-app-router"]);
  });

  it("disable is idempotent — second call doesn't duplicate the id", async () => {
    await withCwd(tmp, () => fragmentsDisableCommand("some-id"));
    await withCwd(tmp, () => fragmentsDisableCommand("some-id"));
    const config = await loadConfig(tmp);
    expect(config!.fragments?.disabled).toEqual(["some-id"]);
  });

  it("enable removes the id from the disabled list", async () => {
    await withCwd(tmp, () => fragmentsDisableCommand("some-id"));
    await withCwd(tmp, () => fragmentsEnableCommand("some-id"));
    const config = await loadConfig(tmp);
    // Empty disabled array collapses to undefined (tidy config).
    expect(config!.fragments).toBeUndefined();
  });

  it("enable is a no-op for an id that wasn't disabled", async () => {
    await withCwd(tmp, () => fragmentsEnableCommand("never-disabled"));
    const config = await loadConfig(tmp);
    expect(config!.fragments).toBeUndefined();
  });

  it("disable with an id not in the resolved set warns but still saves", async () => {
    // Opt out of silent mode for this test so log.warn reaches the
    // spy; beforeEach turned silent on so unrelated tests aren't
    // noisy, but the whole point of THIS test is to observe the warn.
    setSilent(false);
    const warnSpy = vi
      .spyOn(console, "log")
      .mockImplementation(() => undefined);

    await withCwd(tmp, () =>
      fragmentsDisableCommand("definitely-not-a-real-fragment-id"),
    );

    const config = await loadConfig(tmp);
    expect(config!.fragments?.disabled).toEqual([
      "definitely-not-a-real-fragment-id",
    ]);

    // The warn must mention the typo'd id AND suggest `fragments list`.
    const text = warnSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(text).toContain("definitely-not-a-real-fragment-id");
    expect(text).toMatch(/fragments list/);
    warnSpy.mockRestore();
  });
});
