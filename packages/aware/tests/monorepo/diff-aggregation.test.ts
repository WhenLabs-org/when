import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { diffCommand } from "../../src/commands/diff.js";
import { scanMonorepo, computeExtendsPath } from "../../src/monorepo/index.js";
import { saveConfig } from "../../src/utils/config.js";
import { setSilent } from "../../src/utils/logger.js";
import { writeFile } from "../../src/utils/fs.js";
import type { TargetsConfig } from "../../src/types.js";

const targets: TargetsConfig = {
  claude: true,
  cursor: false,
  copilot: false,
  agents: false,
};

async function seedMonorepo(root: string): Promise<void> {
  await fs.writeFile(
    path.join(root, "pnpm-workspace.yaml"),
    "packages:\n  - 'apps/*'\n",
  );
  await fs.writeFile(
    path.join(root, "package.json"),
    JSON.stringify({ name: "mono" }),
  );
  const web = path.join(root, "apps/web");
  await fs.mkdir(path.join(web, "app"), { recursive: true });
  await fs.writeFile(
    path.join(web, "package.json"),
    JSON.stringify({
      name: "@acme/web",
      dependencies: { next: "^15.1.0", react: "^19.0.0" },
    }),
  );
  await fs.writeFile(path.join(web, "app/page.tsx"), "");
}

async function scaffoldMonorepo(root: string): Promise<void> {
  const mono = await scanMonorepo(root, { targets });
  await saveConfig(root, {
    ...mono.root.config,
    packages: mono.workspace.patterns,
  });
  for (const { pkg, result } of mono.packages) {
    await saveConfig(pkg.absolutePath, {
      ...result.config,
      extends: computeExtendsPath(root, pkg.absolutePath),
    });
    for (const file of result.generatedFiles) {
      await writeFile(path.join(pkg.absolutePath, file.path), file.content);
    }
  }
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

describe("aware diff --check on a monorepo", () => {
  let tmp: string;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "aware-mono-diff-"));
    await seedMonorepo(tmp);
    await scaffoldMonorepo(tmp);
    exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    setSilent(true);
  });

  afterEach(() => {
    exitSpy.mockRestore();
    logSpy.mockRestore();
    errSpy.mockRestore();
    setSilent(false);
  });

  it("exits 0 when every package is clean", async () => {
    await withCwd(tmp, () => diffCommand({ check: true, quiet: true }));
    expect(exitSpy).toHaveBeenLastCalledWith(0);
  });

  it("exits 2 when ANY package has tampering", async () => {
    // Tamper with the single package's CLAUDE.md.
    const claudePath = path.join(tmp, "apps/web/CLAUDE.md");
    const original = await fs.readFile(claudePath, "utf8");
    await fs.writeFile(
      claudePath,
      original.replace("Tech Stack", "HACKED"),
    );

    await withCwd(tmp, () => diffCommand({ check: true, quiet: true }));
    expect(exitSpy).toHaveBeenLastCalledWith(2);
  });

  it("exits 1 when a package's extends chain has a cycle (broken configs must not hide from CI)", async () => {
    // Make the package's extends self-referential so resolvePackageConfig
    // throws with "Cycle in ...". Previously the diff path silently
    // skipped — CI would show green while the config was genuinely
    // broken. The regression guarantee: any resolve failure must bump
    // severity to at least `warn`.
    const pkgCfgPath = path.join(tmp, "apps/web/.aware.json");
    const original = JSON.parse(await fs.readFile(pkgCfgPath, "utf8"));
    original.extends = "./";
    await fs.writeFile(pkgCfgPath, JSON.stringify(original, null, 2));

    await withCwd(tmp, () => diffCommand({ check: true, quiet: true }));
    const lastExit = exitSpy.mock.calls[exitSpy.mock.calls.length - 1];
    expect(lastExit?.[0]).toBeGreaterThanOrEqual(1);
    // stderr carries the per-package failure surface so operators can
    // find the bad config.
    const errText = errSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(errText).toContain("apps/web");
  });
});
