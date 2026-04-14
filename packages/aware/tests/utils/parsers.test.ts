import { describe, it, expect } from "vitest";
import { cleanVersion, parsePackageJson, getDepVersion } from "../../src/utils/parsers.js";

const fixtures = new URL("../fixtures", import.meta.url).pathname;

describe("cleanVersion", () => {
  it('cleans "^5.5.3" to "5.5"', () => {
    expect(cleanVersion("^5.5.3")).toBe("5.5");
  });

  it('cleans "~4.2.1" to "4.2"', () => {
    expect(cleanVersion("~4.2.1")).toBe("4.2");
  });

  it('cleans ">=3.0.0" to "3.0"', () => {
    expect(cleanVersion(">=3.0.0")).toBe("3.0");
  });
});

describe("parsePackageJson", () => {
  it("parses nextjs-app package.json", async () => {
    const pkg = await parsePackageJson(`${fixtures}/nextjs-app`);
    expect(pkg).not.toBeNull();
    expect(pkg!.name).toBe("my-nextjs-app");
    expect(pkg!.dependencies).toHaveProperty("next");
    expect(pkg!.devDependencies).toHaveProperty("typescript");
  });

  it("returns null for empty directory", async () => {
    const pkg = await parsePackageJson(`${fixtures}/empty`);
    expect(pkg).toBeNull();
  });
});

describe("getDepVersion", () => {
  it("returns cleaned version from dependencies", async () => {
    const pkg = await parsePackageJson(`${fixtures}/nextjs-app`);
    expect(pkg).not.toBeNull();

    const nextVersion = getDepVersion(pkg!, "next");
    expect(nextVersion).toBe("15.1");
  });

  it("returns cleaned version from devDependencies", async () => {
    const pkg = await parsePackageJson(`${fixtures}/nextjs-app`);
    expect(pkg).not.toBeNull();

    const tsVersion = getDepVersion(pkg!, "typescript");
    expect(tsVersion).toBe("5.5");
  });

  it("returns null for missing dependency", async () => {
    const pkg = await parsePackageJson(`${fixtures}/nextjs-app`);
    expect(pkg).not.toBeNull();

    const missing = getDepVersion(pkg!, "nonexistent-package");
    expect(missing).toBeNull();
  });
});
