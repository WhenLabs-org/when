import { describe, it, expect, beforeEach } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { scanMonorepo } from "../../src/monorepo/scoped-scan.js";
import { discoverWorkspace } from "../../src/monorepo/discovery.js";
import { resolvePackageConfig } from "../../src/monorepo/resolver.js";
import { computeDriftReport, ROOT_PACKAGE_KEY } from "../../src/diff/index.js";
import { saveConfig } from "../../src/utils/config.js";
import { writeFile } from "../../src/utils/fs.js";
import { computeExtendsPath } from "../../src/monorepo/scoped-scan.js";

/**
 * End-to-end: a two-package monorepo with distinct stacks produces
 * distinct context files per package. The headline Phase 4 guarantee.
 */

async function seedMonorepo(root: string): Promise<void> {
  await fs.writeFile(
    path.join(root, "pnpm-workspace.yaml"),
    "packages:\n  - 'apps/*'\n  - 'libs/*'\n",
  );
  await fs.writeFile(
    path.join(root, "package.json"),
    JSON.stringify({ name: "monorepo-root", private: true }),
  );

  const webDir = path.join(root, "apps/web");
  await fs.mkdir(path.join(webDir, "app"), { recursive: true });
  await fs.writeFile(
    path.join(webDir, "package.json"),
    JSON.stringify({
      name: "@acme/web",
      dependencies: { next: "^15.1.0", react: "^19.0.0" },
    }),
  );
  await fs.writeFile(path.join(webDir, "app/page.tsx"), "");

  const libDir = path.join(root, "libs/shared");
  await fs.mkdir(path.join(libDir, "src"), { recursive: true });
  await fs.writeFile(
    path.join(libDir, "package.json"),
    JSON.stringify({
      name: "@acme/shared",
      dependencies: { typescript: "^5.5.0" },
    }),
  );
  await fs.writeFile(path.join(libDir, "src/index.ts"), "export const x = 1;");
}

describe("monorepo end-to-end", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "aware-mono-e2e-"));
    await seedMonorepo(tmp);
  });

  it("scanMonorepo returns one scan per package + root", async () => {
    const mono = await scanMonorepo(tmp, {
      targets: { claude: true, cursor: false, copilot: false, agents: false },
    });
    expect(mono.workspace.isMonorepo).toBe(true);
    expect(mono.packages.map((p) => p.pkg.relativePath)).toEqual([
      "apps/web",
      "libs/shared",
    ]);
    // The web package scan should detect Next.js; the shared lib should not.
    const web = mono.packages.find((p) => p.pkg.relativePath === "apps/web")!;
    const shared = mono.packages.find((p) => p.pkg.relativePath === "libs/shared")!;
    expect(web.result.stack.framework?.name).toBe("nextjs");
    expect(shared.result.stack.framework).toBeNull();
  });

  it("init-workspace-style scaffolding: root + per-package configs extend correctly", async () => {
    const mono = await scanMonorepo(tmp, {
      targets: { claude: true, cursor: false, copilot: false, agents: false },
    });

    // Write root config with `packages`
    await saveConfig(tmp, {
      ...mono.root.config,
      packages: mono.workspace.patterns,
    });

    // Write per-package configs with `extends` pointing at root
    for (const { pkg, result } of mono.packages) {
      await saveConfig(pkg.absolutePath, {
        ...result.config,
        extends: computeExtendsPath(tmp, pkg.absolutePath),
      });
      for (const file of result.generatedFiles) {
        await writeFile(path.join(pkg.absolutePath, file.path), file.content);
      }
    }

    // Resolve a package config and verify inheritance chain length.
    const resolved = await resolvePackageConfig(
      path.join(tmp, "apps/web"),
    );
    expect(resolved).not.toBeNull();
    expect(resolved!.chain.length).toBe(2); // leaf + root
    // Package's stack wins over root's
    expect(resolved!.config.stack.framework).toContain("nextjs");
  });

  it("diff aggregates per-package drift reports", async () => {
    // Seed everything, then run diff on one package — all content-drift
    // entries should carry the right packagePath.
    const mono = await scanMonorepo(tmp, {
      targets: { claude: true, cursor: false, copilot: false, agents: false },
    });
    for (const { pkg, result } of mono.packages) {
      await saveConfig(pkg.absolutePath, {
        ...result.config,
        extends: computeExtendsPath(tmp, pkg.absolutePath),
      });
      // Deliberately skip writing files — so we should see `missing` drifts.
    }

    const web = mono.packages.find((p) => p.pkg.relativePath === "apps/web")!;
    const report = await computeDriftReport({
      projectRoot: web.pkg.absolutePath,
      config: web.result.config,
      packagePath: "apps/web",
    });

    expect(report.severity).toBe("warn");
    expect(report.contentDrifts.every((d) => d.packagePath === "apps/web")).toBe(
      true,
    );
  });

  it("discoverWorkspace + resolvePackageConfig interoperate", async () => {
    const discovery = await discoverWorkspace(tmp);
    expect(discovery.packages).toHaveLength(2);

    // Seed a root and per-package config so resolver has something to
    // walk.
    const mono = await scanMonorepo(tmp, {
      targets: { claude: true, cursor: false, copilot: false, agents: false },
    });
    await saveConfig(tmp, {
      ...mono.root.config,
      packages: mono.workspace.patterns,
      rules: ["shared monorepo rule"],
    });
    for (const { pkg, result } of mono.packages) {
      await saveConfig(pkg.absolutePath, {
        ...result.config,
        rules: [`${pkg.relativePath} rule`],
        extends: computeExtendsPath(tmp, pkg.absolutePath),
      });
    }

    const resolved = await resolvePackageConfig(
      path.join(tmp, "apps/web"),
    );
    expect(resolved!.config.rules).toEqual([
      "shared monorepo rule",
      "apps/web rule",
    ]);
  });
});

describe("computeExtendsPath", () => {
  it("returns a POSIX-style relative .aware.json path", () => {
    const extPath = computeExtendsPath("/repo", "/repo/apps/web");
    expect(extPath.replace(/\\/g, "/")).toMatch(/\.\.\/\.\.\/\.aware\.json$/);
  });
});

describe("ROOT_PACKAGE_KEY remains the root key", () => {
  it("is the empty string, preserved from Phase 1", () => {
    expect(ROOT_PACKAGE_KEY).toBe("");
  });
});
