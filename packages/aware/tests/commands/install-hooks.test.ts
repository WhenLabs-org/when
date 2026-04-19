import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { installHooksCommand } from "../../src/commands/install-hooks.js";
import { setSilent } from "../../src/utils/logger.js";

async function mkTmp(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "aware-install-hooks-"));
}

async function withCwd<T>(dir: string, fn: () => Promise<T>): Promise<T> {
  const original = process.cwd();
  process.chdir(dir);
  try {
    return await fn();
  } finally {
    process.chdir(original);
  }
}

describe("install-hooks — git hook", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkTmp();
    await fs.mkdir(path.join(tmp, ".git"));
    setSilent(true);
  });
  afterEach(() => setSilent(false));

  it("writes a pre-commit hook with the canonical drift check", async () => {
    await withCwd(tmp, () => installHooksCommand());
    const hook = await fs.readFile(
      path.join(tmp, ".git", "hooks", "pre-commit"),
      "utf8",
    );
    expect(hook).toContain("#!/usr/bin/env sh");
    expect(hook).toContain("aware diff --check --quiet");
  });

  it("makes the hook executable (on POSIX)", async () => {
    if (process.platform === "win32") return;
    await withCwd(tmp, () => installHooksCommand());
    const stat = await fs.stat(path.join(tmp, ".git", "hooks", "pre-commit"));
    // Owner execute bit should be set.
    expect(stat.mode & 0o100).not.toBe(0);
  });

  it("does not overwrite an existing hook without --force", async () => {
    await fs.mkdir(path.join(tmp, ".git", "hooks"));
    const hookPath = path.join(tmp, ".git", "hooks", "pre-commit");
    await fs.writeFile(hookPath, "#!/bin/sh\necho existing\n");
    await withCwd(tmp, () => installHooksCommand());
    const hook = await fs.readFile(hookPath, "utf8");
    expect(hook).toContain("echo existing");
    expect(hook).not.toContain("aware diff --check");
  });

  it("overwrites with --force", async () => {
    await fs.mkdir(path.join(tmp, ".git", "hooks"));
    const hookPath = path.join(tmp, ".git", "hooks", "pre-commit");
    await fs.writeFile(hookPath, "#!/bin/sh\necho existing\n");
    await withCwd(tmp, () => installHooksCommand({ force: true }));
    const hook = await fs.readFile(hookPath, "utf8");
    expect(hook).toContain("aware diff --check --quiet");
    expect(hook).not.toContain("echo existing");
  });
});

describe("install-hooks — Husky", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkTmp();
    await fs.mkdir(path.join(tmp, ".husky"));
    setSilent(true);
  });
  afterEach(() => setSilent(false));

  it("installs a Husky hook with exactly one drift-check line", async () => {
    await withCwd(tmp, () => installHooksCommand());
    const hook = await fs.readFile(
      path.join(tmp, ".husky", "pre-commit"),
      "utf8",
    );
    const matches = hook.match(/aware diff --check/g);
    expect(matches).toHaveLength(1);
  });

  it("appends to an existing Husky hook without clobbering other lines", async () => {
    const hookPath = path.join(tmp, ".husky", "pre-commit");
    await fs.writeFile(hookPath, "pnpm lint\n");
    await withCwd(tmp, () => installHooksCommand());
    const hook = await fs.readFile(hookPath, "utf8");
    expect(hook).toContain("pnpm lint");
    expect(hook).toContain("aware diff --check");
  });

  it("is idempotent — re-running does not double-append", async () => {
    await withCwd(tmp, () => installHooksCommand());
    await withCwd(tmp, () => installHooksCommand());
    const hook = await fs.readFile(
      path.join(tmp, ".husky", "pre-commit"),
      "utf8",
    );
    const matches = hook.match(/aware diff --check/g);
    expect(matches).toHaveLength(1);
  });

  it("--force normalizes a hand-edited aware line instead of duplicating", async () => {
    const hookPath = path.join(tmp, ".husky", "pre-commit");
    // User edited the line — different whitespace / flag order.
    await fs.writeFile(hookPath, "pnpm lint\n  aware diff --check\n");
    await withCwd(tmp, () => installHooksCommand({ force: true }));
    const hook = await fs.readFile(hookPath, "utf8");
    const matches = hook.match(/aware diff --check/g);
    expect(matches).toHaveLength(1);
    expect(hook).toContain("pnpm lint");
  });
});

describe("install-hooks — .git as file (worktree)", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkTmp();
    // Simulate a git worktree: .git is a file pointing at a gitdir.
    await fs.writeFile(
      path.join(tmp, ".git"),
      "gitdir: /some/repo/.git/worktrees/foo\n",
    );
    setSilent(true);
  });
  afterEach(() => setSilent(false));

  it("errors helpfully when .git is a file", async () => {
    const exit = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
    try {
      await withCwd(tmp, () => installHooksCommand());
      expect(exit).toHaveBeenCalledWith(1);
    } finally {
      exit.mockRestore();
    }
  });
});

describe("install-hooks — CI snippets", () => {
  let tmp: string;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    tmp = await mkTmp();
    setSilent(true);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
  });
  afterEach(() => {
    setSilent(false);
    logSpy.mockRestore();
  });

  function emittedText(): string {
    return logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
  }

  it("emits a github-actions snippet using pnpm when pnpm-lock exists", async () => {
    await fs.writeFile(path.join(tmp, "pnpm-lock.yaml"), "lockfileVersion: 6\n");
    await withCwd(tmp, () => installHooksCommand({ ci: "github-actions" }));
    const out = emittedText();
    expect(out).toContain("pnpm install --frozen-lockfile");
    expect(out).toContain("pnpm aware diff --check");
  });

  it("emits an npm snippet when package-lock.json is present", async () => {
    await fs.writeFile(path.join(tmp, "package-lock.json"), "{}");
    await withCwd(tmp, () => installHooksCommand({ ci: "github-actions" }));
    const out = emittedText();
    expect(out).toContain("npm ci");
    expect(out).toContain("npx aware diff --check");
    expect(out).not.toMatch(/\bpnpm\b/);
  });

  it("emits a gitlab-ci snippet with the right commands", async () => {
    await fs.writeFile(path.join(tmp, "yarn.lock"), "");
    await withCwd(tmp, () => installHooksCommand({ ci: "gitlab-ci" }));
    const out = emittedText();
    expect(out).toContain("yarn install --frozen-lockfile");
    expect(out).toContain("yarn aware diff --check");
  });
});
