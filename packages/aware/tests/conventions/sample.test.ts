import { describe, it, expect, beforeEach } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  sampleProjectFiles,
  isTestPath,
} from "../../src/conventions/sample.js";

async function seed(root: string, files: string[]): Promise<void> {
  for (const rel of files) {
    const full = path.join(root, rel);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, "// x");
  }
}

describe("isTestPath", () => {
  it("matches common test path patterns", () => {
    expect(isTestPath("tests/foo.ts")).toBe(true);
    expect(isTestPath("test/foo.ts")).toBe(true);
    expect(isTestPath("src/__tests__/foo.ts")).toBe(true);
    expect(isTestPath("src/foo.test.ts")).toBe(true);
    expect(isTestPath("src/foo.spec.js")).toBe(true);
    expect(isTestPath("pkg/foo_test.go")).toBe(true);
  });

  it("does NOT match test-adjacent names like test-helpers/ or testing/", () => {
    // These are production modules that happen to have `test` in the path.
    // Phase-3 regression: previously the `[./]test[./]` pattern matched
    // `test-helpers` because the delimiter class was too loose.
    expect(isTestPath("src/test-helpers/foo.ts")).toBe(false);
    expect(isTestPath("src/testing/foo.ts")).toBe(false);
  });
});

describe("sampleProjectFiles", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "aware-sample-"));
  });

  it("caps at the configured limit even when the repo has many more files", async () => {
    // Seed 300 source files. 200-file cap should yield exactly 200 —
    // streaming stops early; the extractor doesn't walk the other 100.
    const files: string[] = [];
    for (let i = 0; i < 300; i++) files.push(`src/feature-${i}.ts`);
    await seed(tmp, files);

    const result = await sampleProjectFiles(tmp);
    expect(result.total).toBeLessThanOrEqual(200);
    expect(result.source.length).toBeLessThanOrEqual(160); // 80% of 200
  });

  it("honors an explicit limit", async () => {
    const files: string[] = [];
    for (let i = 0; i < 50; i++) files.push(`src/mod-${i}.ts`);
    await seed(tmp, files);

    const result = await sampleProjectFiles(tmp, { limit: 10 });
    expect(result.total).toBeLessThanOrEqual(10);
  });

  it("returns empty buckets for a repo with no source files", async () => {
    await seed(tmp, ["README.md", "LICENSE", "docs/intro.md"]);
    const result = await sampleProjectFiles(tmp);
    expect(result.source).toEqual([]);
    expect(result.test).toEqual([]);
    expect(result.total).toBe(0);
  });

  it("honors .gitignore entries", async () => {
    await seed(tmp, [
      "src/real.ts",
      "generated/noise.ts",
      "custom-build/output.ts",
    ]);
    await fs.writeFile(
      path.join(tmp, ".gitignore"),
      "generated/\ncustom-build/\n",
    );
    const result = await sampleProjectFiles(tmp);
    expect(result.source).toContain("src/real.ts");
    expect(result.source.some((p) => p.startsWith("generated/"))).toBe(false);
    expect(result.source.some((p) => p.startsWith("custom-build/"))).toBe(false);
  });

  it("ignores node_modules and standard build outputs without needing .gitignore", async () => {
    await seed(tmp, [
      "src/real.ts",
      "node_modules/foo/index.js",
      "dist/bundle.js",
      ".next/server/page.js",
      ".turbo/cache.ts",
    ]);
    const result = await sampleProjectFiles(tmp);
    expect(result.source).toEqual(["src/real.ts"]);
  });

  it("partitions source vs test using path patterns", async () => {
    await seed(tmp, [
      "src/app.ts",
      "src/app.test.ts",
      "tests/integration.test.ts",
      "src/__tests__/util.ts",
    ]);
    const result = await sampleProjectFiles(tmp);
    expect(result.source).toContain("src/app.ts");
    expect(result.test).toContain("src/app.test.ts");
    expect(result.test).toContain("tests/integration.test.ts");
    expect(result.test).toContain("src/__tests__/util.ts");
  });
});
