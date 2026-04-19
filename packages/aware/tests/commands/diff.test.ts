import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { diffCommand } from "../../src/commands/diff.js";
import { saveConfig } from "../../src/utils/config.js";
import { setSilent } from "../../src/utils/logger.js";
import { scan } from "../../src/scan.js";
import type { TargetsConfig } from "../../src/types.js";

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

describe("diffCommand — flags", () => {
  let tmp: string;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "aware-diff-flags-"));
    await fs.writeFile(
      path.join(tmp, "package.json"),
      JSON.stringify({
        name: "diff-flags",
        dependencies: { next: "^15.1.0", react: "^19.0.0" },
      }),
    );
    // Seed a clean sync so `diff --check` should exit 0.
    const result = await scan({ projectRoot: tmp, targets, detect: true });
    await saveConfig(tmp, result.config);
    for (const file of result.generatedFiles) {
      await fs.writeFile(path.join(tmp, file.path), file.content);
    }
    exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    exitSpy.mockRestore();
    logSpy.mockRestore();
    setSilent(false);
  });

  it("--check exits 0 when no drift", async () => {
    await withCwd(tmp, () =>
      diffCommand({ check: true, quiet: true }),
    );
    expect(exitSpy).toHaveBeenLastCalledWith(0);
  });

  it("--check exits 2 on tampering", async () => {
    const claudePath = path.join(tmp, "CLAUDE.md");
    const original = await fs.readFile(claudePath, "utf8");
    await fs.writeFile(claudePath, original.replace("Tech Stack", "HACKED"));

    await withCwd(tmp, () =>
      diffCommand({ check: true, quiet: true }),
    );
    expect(exitSpy).toHaveBeenLastCalledWith(2);
  });

  it("--quiet suppresses human output but still exits with right code", async () => {
    // Simulate drift by deleting the file → `missing` → warn.
    await fs.rm(path.join(tmp, "CLAUDE.md"));

    await withCwd(tmp, () => diffCommand({ check: true, quiet: true }));
    expect(logSpy).not.toHaveBeenCalled();
    expect(exitSpy).toHaveBeenLastCalledWith(1);
  });

  it("--json emits valid parseable JSON on stdout", async () => {
    await withCwd(tmp, () => diffCommand({ json: true }));
    // Exactly one call: the JSON payload.
    const jsonCall = logSpy.mock.calls.find((c) =>
      typeof c[0] === "string" && c[0].trim().startsWith("{"),
    );
    expect(jsonCall).toBeDefined();
    const payload = JSON.parse(jsonCall![0] as string);
    expect(payload).toHaveProperty("severity");
    expect(payload).toHaveProperty("stackDrifts");
    expect(payload).toHaveProperty("contentDrifts");
  });

  it("legacy --exit-code auto-suppresses human output and exits 0 when no stack drift", async () => {
    await withCwd(tmp, () => diffCommand({ exitCode: true }));
    expect(logSpy).not.toHaveBeenCalled();
    expect(exitSpy).toHaveBeenLastCalledWith(0);
  });
});
