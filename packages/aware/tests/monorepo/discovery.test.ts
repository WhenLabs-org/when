import { describe, it, expect, beforeEach } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { discoverWorkspace } from "../../src/monorepo/discovery.js";

async function seedPackage(
  root: string,
  relPath: string,
  name: string,
): Promise<void> {
  const dir = path.join(root, relPath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "package.json"), JSON.stringify({ name }));
}

describe("discoverWorkspace — pnpm-workspace.yaml", () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "aware-wksp-pnpm-"));
  });

  it("resolves glob patterns to package directories", async () => {
    await fs.writeFile(
      path.join(tmp, "pnpm-workspace.yaml"),
      "packages:\n  - 'apps/*'\n  - 'libs/*'\n",
    );
    await seedPackage(tmp, "apps/web", "@acme/web");
    await seedPackage(tmp, "apps/api", "@acme/api");
    await seedPackage(tmp, "libs/shared", "@acme/shared");

    const ws = await discoverWorkspace(tmp);
    expect(ws.isMonorepo).toBe(true);
    expect(ws.source).toBe("pnpm-workspace.yaml");
    expect(ws.packages.map((p) => p.relativePath)).toEqual([
      "apps/api",
      "apps/web",
      "libs/shared",
    ]);
    expect(ws.packages.find((p) => p.relativePath === "apps/web")!.name).toBe(
      "@acme/web",
    );
  });

  it("ignores directories without a package.json", async () => {
    await fs.writeFile(
      path.join(tmp, "pnpm-workspace.yaml"),
      "packages:\n  - 'apps/*'\n",
    );
    await seedPackage(tmp, "apps/real", "@acme/real");
    await fs.mkdir(path.join(tmp, "apps/empty"));
    const ws = await discoverWorkspace(tmp);
    expect(ws.packages.map((p) => p.relativePath)).toEqual(["apps/real"]);
  });
});

describe("discoverWorkspace — package.json workspaces", () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "aware-wksp-npm-"));
  });

  it("reads the array form", async () => {
    await fs.writeFile(
      path.join(tmp, "package.json"),
      JSON.stringify({ name: "root", workspaces: ["packages/*"] }),
    );
    await seedPackage(tmp, "packages/a", "@acme/a");
    await seedPackage(tmp, "packages/b", "@acme/b");

    const ws = await discoverWorkspace(tmp);
    expect(ws.source).toBe("package.json");
    expect(ws.packages).toHaveLength(2);
  });

  it("reads the object form ({ packages: [...] })", async () => {
    await fs.writeFile(
      path.join(tmp, "package.json"),
      JSON.stringify({
        name: "root",
        workspaces: { packages: ["apps/*"] },
      }),
    );
    await seedPackage(tmp, "apps/web", "@acme/web");

    const ws = await discoverWorkspace(tmp);
    expect(ws.packages).toHaveLength(1);
  });
});

describe("discoverWorkspace — pnpm negation patterns", () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "aware-wksp-neg-"));
  });

  it("excludes packages matched by '!' negation", async () => {
    await fs.writeFile(
      path.join(tmp, "pnpm-workspace.yaml"),
      "packages:\n  - 'apps/*'\n  - '!apps/legacy'\n",
    );
    await seedPackage(tmp, "apps/web", "@acme/web");
    await seedPackage(tmp, "apps/api", "@acme/api");
    await seedPackage(tmp, "apps/legacy", "@acme/legacy");

    const ws = await discoverWorkspace(tmp);
    const names = ws.packages.map((p) => p.relativePath);
    expect(names).toContain("apps/web");
    expect(names).toContain("apps/api");
    expect(names).not.toContain("apps/legacy");
  });
});

describe("discoverWorkspace — no monorepo", () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "aware-wksp-single-"));
  });

  it("returns isMonorepo:false for a plain project", async () => {
    await fs.writeFile(
      path.join(tmp, "package.json"),
      JSON.stringify({ name: "single" }),
    );
    const ws = await discoverWorkspace(tmp);
    expect(ws.isMonorepo).toBe(false);
    expect(ws.packages).toEqual([]);
    expect(ws.source).toBeNull();
  });
});
