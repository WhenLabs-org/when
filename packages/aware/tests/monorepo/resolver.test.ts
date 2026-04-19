import { describe, it, expect, beforeEach } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { resolvePackageConfig } from "../../src/monorepo/resolver.js";
import { createDefaultConfig, saveConfig } from "../../src/utils/config.js";
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
const allTargets: TargetsConfig = {
  claude: true,
  cursor: true,
  copilot: true,
  agents: true,
};

describe("resolvePackageConfig", () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "aware-resolver-"));
  });

  it("returns null when no config exists at the leaf", async () => {
    const result = await resolvePackageConfig(tmp);
    expect(result).toBeNull();
  });

  it("returns the leaf config unchanged when it has no extends", async () => {
    const cfg = createDefaultConfig("leaf", emptyStack, allTargets);
    cfg.rules = ["leaf rule"];
    await saveConfig(tmp, cfg);

    const result = await resolvePackageConfig(tmp);
    expect(result).not.toBeNull();
    expect(result!.config.project.name).toBe("leaf");
    expect(result!.config.rules).toEqual(["leaf rule"]);
    expect(result!.chain).toHaveLength(1);
  });

  it("merges root into leaf: leaf wins on overlap, rules concatenate", async () => {
    const rootDir = tmp;
    const pkgDir = path.join(tmp, "apps/web");
    await fs.mkdir(pkgDir, { recursive: true });

    const root = createDefaultConfig("root", emptyStack, allTargets);
    root.rules = ["root rule"];
    root.conventions = { naming: { files: "kebab-case" } };
    await saveConfig(rootDir, root);

    const leaf = createDefaultConfig("@acme/web", emptyStack, allTargets);
    leaf.rules = ["leaf rule"];
    leaf.extends = "../../";
    await saveConfig(pkgDir, leaf);

    const resolved = await resolvePackageConfig(pkgDir);
    expect(resolved).not.toBeNull();
    // leaf.project wins
    expect(resolved!.config.project.name).toBe("@acme/web");
    // rules concatenate (root first, then leaf)
    expect(resolved!.config.rules).toEqual(["root rule", "leaf rule"]);
    // root convention flows through
    expect(resolved!.config.conventions.naming?.files).toBe("kebab-case");
    expect(resolved!.chain.length).toBe(2);
  });

  it("detects a cycle in the extends chain", async () => {
    const a = path.join(tmp, "a");
    const b = path.join(tmp, "b");
    await fs.mkdir(a);
    await fs.mkdir(b);

    const cfgA = createDefaultConfig("a", emptyStack, allTargets);
    cfgA.extends = "../b";
    const cfgB = createDefaultConfig("b", emptyStack, allTargets);
    cfgB.extends = "../a";

    await saveConfig(a, cfgA);
    await saveConfig(b, cfgB);

    await expect(resolvePackageConfig(a)).rejects.toThrow(/Cycle/);
  });

  it("detects a longer (depth-3) cycle", async () => {
    const a = path.join(tmp, "a");
    const b = path.join(tmp, "b");
    const c = path.join(tmp, "c");
    await fs.mkdir(a);
    await fs.mkdir(b);
    await fs.mkdir(c);

    const cfgA = createDefaultConfig("a", emptyStack, allTargets);
    cfgA.extends = "../b";
    const cfgB = createDefaultConfig("b", emptyStack, allTargets);
    cfgB.extends = "../c";
    const cfgC = createDefaultConfig("c", emptyStack, allTargets);
    cfgC.extends = "../a";

    await saveConfig(a, cfgA);
    await saveConfig(b, cfgB);
    await saveConfig(c, cfgC);

    await expect(resolvePackageConfig(a)).rejects.toThrow(/Cycle/);
  });

  it("accepts file-form extends (../../.aware.json)", async () => {
    const root = tmp;
    const pkg = path.join(tmp, "pkg");
    await fs.mkdir(pkg);

    const rootCfg = createDefaultConfig("root", emptyStack, allTargets);
    rootCfg.rules = ["from-root"];
    await saveConfig(root, rootCfg);

    const leaf = createDefaultConfig("leaf", emptyStack, allTargets);
    leaf.extends = "../.aware.json";
    leaf.rules = ["from-leaf"];
    await saveConfig(pkg, leaf);

    const resolved = await resolvePackageConfig(pkg);
    expect(resolved).not.toBeNull();
    expect(resolved!.config.rules).toEqual(["from-root", "from-leaf"]);
    expect(resolved!.chain.length).toBe(2);
  });

  it("fragments.disabled unions across the extends chain (root + leaf)", async () => {
    const root = tmp;
    const pkg = path.join(tmp, "pkg");
    await fs.mkdir(pkg);

    const rootCfg = createDefaultConfig("root", emptyStack, allTargets);
    rootCfg.fragments = { disabled: ["suppressed-by-root"] };
    await saveConfig(root, rootCfg);

    const leaf = createDefaultConfig("leaf", emptyStack, allTargets);
    leaf.extends = "../";
    leaf.fragments = { disabled: ["suppressed-by-leaf"] };
    await saveConfig(pkg, leaf);

    const resolved = await resolvePackageConfig(pkg);
    // Before the fix, leaf's fragments silently shadowed root's
    // (root's "suppressed-by-root" would be dropped). Union semantics
    // mean both disables survive.
    expect(resolved!.config.fragments?.disabled).toEqual(
      expect.arrayContaining(["suppressed-by-root", "suppressed-by-leaf"]),
    );
    expect(resolved!.config.fragments?.disabled).toHaveLength(2);
  });

  it("fragments.disabled unions deduplicate identical entries", async () => {
    const root = tmp;
    const pkg = path.join(tmp, "pkg");
    await fs.mkdir(pkg);

    const rootCfg = createDefaultConfig("root", emptyStack, allTargets);
    rootCfg.fragments = { disabled: ["shared-id"] };
    await saveConfig(root, rootCfg);

    const leaf = createDefaultConfig("leaf", emptyStack, allTargets);
    leaf.extends = "../";
    leaf.fragments = { disabled: ["shared-id"] };
    await saveConfig(pkg, leaf);

    const resolved = await resolvePackageConfig(pkg);
    expect(resolved!.config.fragments?.disabled).toEqual(["shared-id"]);
  });

  it("leaf's _meta replaces root's _meta wholesale (no merging)", async () => {
    // If _meta merged, root's fileHashes would bleed into the leaf's
    // resolved config and Phase 1 drift detection would read stale
    // hashes. Lock in the wholesale-replace contract.
    const root = tmp;
    const pkg = path.join(tmp, "pkg");
    await fs.mkdir(pkg);

    const rootCfg = createDefaultConfig("root", emptyStack, allTargets);
    rootCfg._meta.fileHashes = { "": { claude: "root-hash-DO-NOT-LEAK" } };
    await saveConfig(root, rootCfg);

    const leaf = createDefaultConfig("leaf", emptyStack, allTargets);
    leaf.extends = "../";
    leaf._meta.fileHashes = { "": { claude: "leaf-hash" } };
    await saveConfig(pkg, leaf);

    const resolved = await resolvePackageConfig(pkg);
    expect(resolved!.config._meta.fileHashes?.[""]?.claude).toBe("leaf-hash");
  });
});
