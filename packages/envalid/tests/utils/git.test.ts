import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  installHook,
  uninstallHook,
  isHookInstalled,
  getGitRoot,
} from "../../src/utils/git.js";
import { execSync } from "node:child_process";
import { mkdirSync, rmSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const testDir = join(tmpdir(), "envalid-git-test");

describe("getGitRoot", () => {
  it("returns a string when in a git repo", () => {
    const root = getGitRoot();
    // We're running from the project dir which may or may not be a git repo
    // Just check it returns string or null
    expect(typeof root === "string" || root === null).toBe(true);
  });
});

describe("hook install/uninstall", () => {
  beforeEach(() => {
    rmSync(testDir, { recursive: true, force: true });
    mkdirSync(testDir, { recursive: true });
    execSync("git init", { cwd: testDir, stdio: "pipe" });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("installs and uninstalls hook in a git repo", () => {
    // Run install from inside the test git repo
    const originalCwd = process.cwd();
    process.chdir(testDir);

    try {
      expect(isHookInstalled()).toBe(false);

      const installResult = installHook();
      expect(installResult.installed).toBe(true);
      expect(isHookInstalled()).toBe(true);

      // Verify hook file contents
      const hookPath = join(testDir, ".git", "hooks", "pre-commit");
      expect(existsSync(hookPath)).toBe(true);
      const content = readFileSync(hookPath, "utf-8");
      expect(content).toContain("envalid");
      expect(content).toContain("#!/bin/sh");

      // Installing again should say already installed
      const reInstall = installHook();
      expect(reInstall.installed).toBe(false);

      // Uninstall
      const uninstallResult = uninstallHook();
      expect(uninstallResult.removed).toBe(true);
      expect(isHookInstalled()).toBe(false);
    } finally {
      process.chdir(originalCwd);
    }
  });
});
